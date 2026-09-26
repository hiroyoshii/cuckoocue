import Foundation

enum RunTransferLink {
    private static let validID = try! NSRegularExpression(pattern: "^[A-Za-z0-9_-]{1,128}$")

    static func runID(from url: URL) -> String? {
        guard url.scheme == "https", url.host == "cuckoocue.hiyozoo.com", url.path == "/import",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let items = components.queryItems, items.count == 1,
              items[0].name == "run_id", let runID = items[0].value,
              isValidID(runID) else { return nil }
        return runID
    }

    static func completedEditorURL(runID: String, taskIDs: [String]) -> URL? {
        guard isValidID(runID), !taskIDs.isEmpty, Set(taskIDs).count == taskIDs.count,
              taskIDs.allSatisfy(isValidID) else { return nil }
        var components = URLComponents(string: "https://cuckoocue.hiyozoo.com")
        components?.queryItems = [URLQueryItem(name: "run_id", value: runID)]
        components?.fragment = "edit_tasks=" + taskIDs.joined(separator: ",")
        return components?.url
    }

    static func isValidID(_ value: String) -> Bool {
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        return validID.firstMatch(in: value, range: range)?.range == range
    }
}

enum RunSyncError: LocalizedError {
    case invalidLink
    case signedOut
    case configurationMissing
    case accountChanged
    case ownerMismatch
    case localRunCollision
    case missingVersion
    case invalidResponse
    case blocked(status: Int, message: String)
    case retryable(message: String)

    var errorDescription: String? {
        switch self {
        case .invalidLink: "リンクが正しくありません。"
        case .signedOut: "Webと同じアカウントでログインしてください。"
        case .configurationMissing: "iOS用のFirebase設定がまだ登録されていません。"
        case .accountChanged: "処理中にアカウントが変更されました。もう一度お試しください。"
        case .ownerMismatch: "別のアカウントのリストは送受信できません。"
        case .localRunCollision: "同じIDのローカルリストがあるため、上書きせず停止しました。"
        case .missingVersion: "同期元の版を確認できませんでした。"
        case .invalidResponse: "Webから受け取ったリストの形式が正しくありません。"
        case let .blocked(_, message), let .retryable(message): message
        }
    }

    var isRetryable: Bool {
        if case .retryable = self { return true }
        return false
    }
}

struct ReceivedRun {
    let run: CueRun
    let etag: String
}

struct RunAPIClient {
    typealias Loader = (URLRequest) async throws -> (Data, URLResponse)

    private let baseURL: URL
    private let load: Loader

    init(
        baseURL: URL = URL(string: "https://cuckoocue.hiyozoo.com")!,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        load = { request in try await session.data(for: request) }
    }

    init(baseURL: URL, load: @escaping Loader) {
        self.baseURL = baseURL
        self.load = load
    }

    func receive(runID: String, token: String) async throws -> ReceivedRun {
        guard RunTransferLink.isValidID(runID) else { throw RunSyncError.invalidLink }
        var request = URLRequest(url: baseURL.appending(path: "api/runs/\(runID)/snapshot"))
        request.timeoutInterval = 12
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await perform(request)
        guard response.statusCode == 200 else { throw statusError(response.statusCode, data: data, receiving: true) }
        guard let etag = response.value(forHTTPHeaderField: "ETag"), !etag.isEmpty else {
            throw RunSyncError.missingVersion
        }
        guard let envelope = try? Self.decoder.decode(RunEnvelope.self, from: data), envelope.run.id == runID,
              envelope.run.hasUniqueTaskIDs else { throw RunSyncError.invalidResponse }
        return ReceivedRun(run: envelope.run.localValue, etag: etag)
    }

    func sync(run: CueRun, token: String, etag: String?) async throws -> String? {
        guard RunTransferLink.isValidID(run.id) else { throw RunSyncError.invalidLink }
        let payload = SyncedRun(run: run)
        var request = URLRequest(url: baseURL.appending(path: "api/runs/\(run.id)"))
        request.httpMethod = "PUT"
        request.timeoutInterval = 12
        request.httpBody = try Self.encoder.encode(payload)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let etag { request.setValue(etag, forHTTPHeaderField: "If-Match") }
        let (data, response) = try await perform(request)
        guard (200...299).contains(response.statusCode) else {
            throw statusError(response.statusCode, data: data, receiving: false)
        }
        return response.value(forHTTPHeaderField: "ETag") ?? etag
    }

    func deleteAccount(token: String) async throws {
        var request = URLRequest(url: baseURL.appending(path: "api/account"))
        request.httpMethod = "DELETE"
        request.timeoutInterval = 30
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await perform(request)
        guard (200...299).contains(response.statusCode) else {
            throw statusError(response.statusCode, data: data, receiving: false)
        }
    }

    private func perform(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, response) = try await load(request)
            guard let response = response as? HTTPURLResponse else { throw RunSyncError.invalidResponse }
            return (data, response)
        } catch let error as RunSyncError {
            throw error
        } catch {
            throw RunSyncError.retryable(message: "通信できませんでした。接続を確認して再試行してください。")
        }
    }

    private func statusError(_ status: Int, data: Data, receiving: Bool) -> RunSyncError {
        let serverMessage = (try? Self.decoder.decode(APIErrorEnvelope.self, from: data).error)
        let fallback = receiving ? "保存したリストを取得できませんでした（\(status)）。" : "実行結果を保存できませんでした（\(status)）。"
        let message = serverMessage?.isEmpty == false ? serverMessage! : fallback
        if [400, 401, 403, 404, 409].contains(status) { return .blocked(status: status, message: message) }
        return .retryable(message: message)
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()
    private static let decoder = JSONDecoder()
}

private struct APIErrorEnvelope: Decodable { let error: String }
private struct RunEnvelope: Decodable { let run: SyncedRun }

private struct SyncedRun: Codable {
    let id: String
    let title: String
    let sourceCuebookID: String?
    let targetAnchorDay: Int64?
    let sortOrder: Int
    let archivedAt: Int64?
    let completedAnchorAt: Int64?
    let timeZone: String
    let createdAt: Int64
    let updatedAt: Int64
    let tasks: [SyncedTask]

    enum CodingKeys: String, CodingKey {
        case id, title, tasks
        case sourceCuebookID = "source_cuebook_id"
        case targetAnchorDay = "target_anchor_day"
        case sortOrder = "sort_order"
        case archivedAt = "archived_at"
        case completedAnchorAt = "completed_anchor_at"
        case timeZone = "time_zone"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    init(run: CueRun) {
        id = run.id
        title = run.title
        sourceCuebookID = run.sourceCuebookID
        targetAnchorDay = run.targetAnchorDay.map(epochMillis)
        sortOrder = run.sortOrder
        archivedAt = run.archivedAt.map(epochMillis)
        completedAnchorAt = run.completedAnchorAt.map(epochMillis)
        timeZone = run.timeZone ?? TimeZone.current.identifier
        createdAt = epochMillis(run.createdAt)
        updatedAt = epochMillis(run.updatedAt)
        tasks = run.tasks
            .filter { !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .map(SyncedTask.init)
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(id, forKey: .id)
        try values.encode(title, forKey: .title)
        try values.encodeIfPresent(sourceCuebookID, forKey: .sourceCuebookID)
        try values.encodeIfPresent(targetAnchorDay, forKey: .targetAnchorDay)
        try values.encode(sortOrder, forKey: .sortOrder)
        if let archivedAt { try values.encode(archivedAt, forKey: .archivedAt) }
        else { try values.encodeNil(forKey: .archivedAt) }
        if let completedAnchorAt { try values.encode(completedAnchorAt, forKey: .completedAnchorAt) }
        else { try values.encodeNil(forKey: .completedAnchorAt) }
        try values.encode(timeZone, forKey: .timeZone)
        try values.encode(createdAt, forKey: .createdAt)
        try values.encode(updatedAt, forKey: .updatedAt)
        try values.encode(tasks, forKey: .tasks)
    }

    var hasUniqueTaskIDs: Bool { Set(tasks.map(\.id)).count == tasks.count }

    var localValue: CueRun {
        CueRun(
            id: id,
            title: title,
            sourceCuebookID: sourceCuebookID,
            targetAnchorDay: targetAnchorDay.map(dateFromEpochMillis),
            timeZone: timeZone,
            sortOrder: sortOrder,
            archivedAt: archivedAt.map(dateFromEpochMillis),
            completedAnchorAt: completedAnchorAt.map(dateFromEpochMillis),
            createdAt: dateFromEpochMillis(createdAt),
            updatedAt: dateFromEpochMillis(updatedAt),
            tasks: tasks.map { $0.localValue(runID: id) }
        )
    }
}

private struct SyncedTask: Codable {
    let id: String
    let title: String
    let sourceTaskID: String?
    let userPriority: Int?
    let availableFrom: Int64?
    let dueAt: Int64?
    let sortOrder: Int
    let completedAt: Int64?
    let createdAt: Int64
    let updatedAt: Int64

    enum CodingKeys: String, CodingKey {
        case id, title
        case sourceTaskID = "source_task_id"
        case userPriority = "user_priority"
        case availableFrom = "available_from_at"
        case dueAt = "due_at"
        case sortOrder = "sort_order"
        case completedAt = "completed_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    init(task: CueTask) {
        id = task.id
        title = task.title
        sourceTaskID = task.sourceTaskID
        userPriority = task.userPriority?.rawValue
        availableFrom = task.availableFrom.map(epochMillis)
        dueAt = task.dueAt.map(epochMillis)
        sortOrder = task.sortOrder
        completedAt = task.completedAt.map(epochMillis)
        createdAt = epochMillis(task.createdAt)
        updatedAt = epochMillis(task.updatedAt)
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(id, forKey: .id)
        try values.encode(title, forKey: .title)
        try values.encodeIfPresent(sourceTaskID, forKey: .sourceTaskID)
        if let userPriority { try values.encode(userPriority, forKey: .userPriority) }
        else { try values.encodeNil(forKey: .userPriority) }
        if let availableFrom { try values.encode(availableFrom, forKey: .availableFrom) }
        else { try values.encodeNil(forKey: .availableFrom) }
        if let dueAt { try values.encode(dueAt, forKey: .dueAt) }
        else { try values.encodeNil(forKey: .dueAt) }
        try values.encode(sortOrder, forKey: .sortOrder)
        if let completedAt { try values.encode(completedAt, forKey: .completedAt) }
        else { try values.encodeNil(forKey: .completedAt) }
        try values.encode(createdAt, forKey: .createdAt)
        try values.encode(updatedAt, forKey: .updatedAt)
    }

    func localValue(runID: String) -> CueTask {
        CueTask(
            id: id,
            runID: runID,
            sourceTaskID: sourceTaskID,
            title: title,
            userPriority: userPriority.flatMap(CuePriority.init(rawValue:)),
            availableFrom: availableFrom.map(dateFromEpochMillis),
            dueAt: dueAt.map(dateFromEpochMillis),
            sortOrder: sortOrder,
            completedAt: completedAt.map(dateFromEpochMillis),
            createdAt: dateFromEpochMillis(createdAt),
            updatedAt: dateFromEpochMillis(updatedAt)
        )
    }
}

private func epochMillis(_ date: Date) -> Int64 {
    Int64((date.timeIntervalSince1970 * 1_000).rounded())
}

private func dateFromEpochMillis(_ value: Int64) -> Date {
    Date(timeIntervalSince1970: Double(value) / 1_000)
}
