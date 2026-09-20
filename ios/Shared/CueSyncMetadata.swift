import Foundation

struct CueRunSyncMetadata: Codable, Equatable {
    var ownerID: String?
    var etag: String?
    var pending = false
    var lastError: String?
}

enum CueSyncMetadataStore {
    private static let keyPrefix = "run-sync."

    static func metadata(for runID: String) -> CueRunSyncMetadata? {
        guard let data = defaults.data(forKey: key(for: runID)) else { return nil }
        return try? JSONDecoder().decode(CueRunSyncMetadata.self, from: data)
    }

    static func pendingRunIDs(ownerID: String) -> [String] {
        defaults.dictionaryRepresentation().compactMap { key, value in
            guard key.hasPrefix(keyPrefix), let data = value as? Data,
                  let metadata = try? JSONDecoder().decode(CueRunSyncMetadata.self, from: data),
                  metadata.pending, metadata.ownerID == ownerID else { return nil }
            return String(key.dropFirst(keyPrefix.count))
        }
    }

    static func markPending(runID: String) {
        update(runID: runID) { metadata in
            metadata.pending = true
            metadata.lastError = nil
        }
    }

    @discardableResult
    static func claim(runID: String, ownerID: String) -> Bool {
        var accepted = false
        update(runID: runID) { metadata in
            guard metadata.ownerID == nil || metadata.ownerID == ownerID else { return }
            metadata.ownerID = ownerID
            metadata.pending = true
            metadata.lastError = nil
            accepted = true
        }
        return accepted
    }

    static func recordReceived(runID: String, ownerID: String, etag: String) {
        save(CueRunSyncMetadata(ownerID: ownerID, etag: etag), runID: runID)
    }

    static func recordSynced(runID: String, ownerID: String, etag: String?) {
        update(runID: runID) { metadata in
            guard metadata.ownerID == ownerID else { return }
            metadata.etag = etag ?? metadata.etag
            metadata.pending = false
            metadata.lastError = nil
        }
    }

    static func recordFailure(runID: String, ownerID: String, message: String, retryable: Bool) {
        update(runID: runID) { metadata in
            guard metadata.ownerID == ownerID else { return }
            metadata.pending = retryable
            metadata.lastError = message
        }
    }

    static func resetForTesting() {
        defaults.dictionaryRepresentation().keys
            .filter { $0.hasPrefix(keyPrefix) }
            .forEach(defaults.removeObject(forKey:))
    }

    private static func update(runID: String, mutation: (inout CueRunSyncMetadata) -> Void) {
        var metadata = metadata(for: runID) ?? CueRunSyncMetadata()
        mutation(&metadata)
        save(metadata, runID: runID)
    }

    private static func save(_ metadata: CueRunSyncMetadata, runID: String) {
        guard let data = try? JSONEncoder().encode(metadata) else { return }
        defaults.set(data, forKey: key(for: runID))
    }

    private static func key(for runID: String) -> String { keyPrefix + runID }

    private static var defaults: UserDefaults {
        UserDefaults(suiteName: CueStorage.appGroupID) ?? .standard
    }
}
