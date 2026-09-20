import Foundation

@MainActor
final class RunTransferController: ObservableObject {
    enum TransferState: Equatable {
        case idle
        case needsSignIn(runID: String)
        case receiving(runID: String)
        case failed(runID: String, message: String)
    }

    @Published private(set) var user: RunAuthUser?
    @Published private(set) var configurationAvailable: Bool
    @Published private(set) var transferState: TransferState = .idle
    @Published private(set) var openedRunID: String?
    @Published private(set) var backgroundError: String?

    private let store: CueStore
    private let auth: RunAuthenticating
    private let api: RunAPIClient
    private var pendingRunID: String?
    private var syncTasks: [String: Task<Void, Never>] = [:]

    init(
        store: CueStore,
        auth: RunAuthenticating? = nil,
        api: RunAPIClient = RunAPIClient()
    ) {
        self.store = store
        let authenticator = auth ?? FirebaseRunAuthenticator()
        self.auth = authenticator
        self.api = api
        user = authenticator.user
        configurationAvailable = authenticator.configurationAvailable
        authenticator.onChange = { [weak self] user in self?.authenticationChanged(user) }
        store.onRunMutation = { [weak self] runID in self?.runDidMutate(runID) }
    }

    func handle(url: URL) {
        if auth.handle(url: url) { return }
        guard let runID = RunTransferLink.runID(from: url) else { return }
        pendingRunID = runID
        if user == nil {
            transferState = .needsSignIn(runID: runID)
        } else {
            Task { await receivePendingRun() }
        }
    }

    func signIn() async {
        do {
            try await auth.signIn()
        } catch {
            let runID = pendingRunID ?? ""
            transferState = .failed(runID: runID, message: error.localizedDescription)
        }
    }

    func signOut() {
        do {
            try auth.signOut()
            pendingRunID = nil
            transferState = .idle
            backgroundError = nil
        } catch {
            backgroundError = error.localizedDescription
        }
    }

    func retryReceive() {
        Task { await receivePendingRun() }
    }

    func consumeOpenedRunID() {
        openedRunID = nil
    }

    func applicationBecameActive() {
        store.reloadFromStorage()
        flushOwnedPendingRuns()
    }

    func prepareForWeb(runID: String, completedTaskIDs: [String]) async throws -> URL {
        guard let user else { throw RunSyncError.signedOut }
        let metadata = CueSyncMetadataStore.metadata(for: runID)
        if let ownerID = metadata?.ownerID, ownerID != user.id { throw RunSyncError.ownerMismatch }
        guard CueSyncMetadataStore.claim(runID: runID, ownerID: user.id) else { throw RunSyncError.ownerMismatch }
        _ = try await syncWithRetry(runID: runID, ownerID: user.id)
        guard let url = RunTransferLink.completedEditorURL(runID: runID, taskIDs: completedTaskIDs) else {
            throw RunSyncError.invalidLink
        }
        return url
    }

    private func authenticationChanged(_ user: RunAuthUser?) {
        self.user = user
        if user == nil {
            syncTasks.values.forEach { $0.cancel() }
            syncTasks.removeAll()
            if let pendingRunID { transferState = .needsSignIn(runID: pendingRunID) }
            return
        }
        if pendingRunID != nil { Task { await receivePendingRun() } }
        flushOwnedPendingRuns()
    }

    private func receivePendingRun() async {
        guard let runID = pendingRunID else { return }
        guard let owner = user else {
            transferState = .needsSignIn(runID: runID)
            return
        }

        if let local = store.snapshot.runs.first(where: { $0.id == runID }) {
            let metadata = CueSyncMetadataStore.metadata(for: local.id)
            guard metadata?.ownerID == owner.id else {
                transferState = .failed(runID: runID, message: RunSyncError.localRunCollision.localizedDescription)
                return
            }
            pendingRunID = nil
            transferState = .idle
            openedRunID = runID
            return
        }

        transferState = .receiving(runID: runID)
        do {
            let token = try await auth.idToken()
            guard user?.id == owner.id else { throw RunSyncError.accountChanged }
            let received = try await api.receive(runID: runID, token: token)
            guard user?.id == owner.id else { throw RunSyncError.accountChanged }
            guard store.insertReceivedRun(received.run) else { throw RunSyncError.localRunCollision }
            CueSyncMetadataStore.recordReceived(runID: runID, ownerID: owner.id, etag: received.etag)
            pendingRunID = nil
            transferState = .idle
            openedRunID = runID
        } catch {
            transferState = .failed(runID: runID, message: error.localizedDescription)
        }
    }

    private func runDidMutate(_ runID: String) {
        guard let owner = user else { return }
        guard CueSyncMetadataStore.claim(runID: runID, ownerID: owner.id) else {
            backgroundError = RunSyncError.ownerMismatch.localizedDescription
            return
        }
        enqueueSync(runID: runID, ownerID: owner.id)
    }

    private func flushOwnedPendingRuns() {
        guard let owner = user else { return }
        CueSyncMetadataStore.pendingRunIDs(ownerID: owner.id)
            .forEach { enqueueSync(runID: $0, ownerID: owner.id) }
    }

    private func enqueueSync(runID: String, ownerID: String) {
        guard syncTasks[runID] == nil else { return }
        syncTasks[runID] = Task { [weak self] in
            guard let self else { return }
            var needsResync = false
            do {
                needsResync = try await self.syncWithRetry(runID: runID, ownerID: ownerID)
            } catch {
                self.backgroundError = error.localizedDescription
            }
            self.syncTasks[runID] = nil
            if needsResync, self.user?.id == ownerID {
                self.enqueueSync(runID: runID, ownerID: ownerID)
            }
        }
    }

    private func syncWithRetry(runID: String, ownerID: String) async throws -> Bool {
        guard let run = store.snapshot.runs.first(where: { $0.id == runID }) else { return false }
        let metadata = CueSyncMetadataStore.metadata(for: runID)
        guard metadata?.ownerID == ownerID, user?.id == ownerID else { throw RunSyncError.ownerMismatch }

        var lastError: Error = RunSyncError.retryable(message: "同期できませんでした。")
        for attempt in 0..<3 {
            do {
                let token = try await auth.idToken()
                guard user?.id == ownerID else { throw RunSyncError.accountChanged }
                let etag = try await api.sync(run: run, token: token, etag: metadata?.etag)
                guard user?.id == ownerID else { throw RunSyncError.accountChanged }
                let changedWhileSyncing = store.snapshot.runs.first(where: { $0.id == runID })?.updatedAt != run.updatedAt
                if !changedWhileSyncing {
                    CueSyncMetadataStore.recordSynced(runID: runID, ownerID: ownerID, etag: etag)
                } else {
                    CueSyncMetadataStore.recordSynced(runID: runID, ownerID: ownerID, etag: etag)
                    CueSyncMetadataStore.markPending(runID: runID)
                }
                backgroundError = nil
                return changedWhileSyncing
            } catch {
                lastError = error
                let syncError = error as? RunSyncError
                guard syncError?.isRetryable == true, attempt < 2 else {
                    CueSyncMetadataStore.recordFailure(
                        runID: runID,
                        ownerID: ownerID,
                        message: error.localizedDescription,
                        retryable: syncError?.isRetryable == true
                    )
                    throw error
                }
                try await Task.sleep(for: .milliseconds(500 * (attempt + 1)))
            }
        }
        throw lastError
    }
}
