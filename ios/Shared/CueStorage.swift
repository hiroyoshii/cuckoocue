import Foundation

enum CueStorage {
    static let appGroupID = "group.app.cuckoocue.shared"
    private static let fileName = "cuckoo-cue-snapshot.json"

    static func load() -> CueSnapshot {
        guard let data = coordinatedRead(),
              let snapshot = try? decoder.decode(CueSnapshot.self, from: data) else {
            return CueSnapshot()
        }
        return snapshot
    }

    @discardableResult
    static func update(_ mutate: (inout CueSnapshot) -> Void) -> CueSnapshot {
        var snapshot = load()
        mutate(&snapshot)
        snapshot.updatedAt = .now
        save(snapshot)
        return snapshot
    }

    static func save(_ snapshot: CueSnapshot) {
        guard let data = try? encoder.encode(snapshot) else { return }
        coordinatedWrite(data)
    }

    static func resetForUITesting() {
        save(.demo)
    }

    private static var storageURL: URL {
        if let groupURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupID
        ) {
            return groupURL.appendingPathComponent(fileName)
        }
        return FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
    }

    private static func coordinatedRead() -> Data? {
        var result: Data?
        var coordinationError: NSError?
        NSFileCoordinator().coordinate(
            readingItemAt: storageURL,
            options: [],
            error: &coordinationError
        ) { url in
            result = try? Data(contentsOf: url)
        }
        return result
    }

    private static func coordinatedWrite(_ data: Data) {
        var coordinationError: NSError?
        NSFileCoordinator().coordinate(
            writingItemAt: storageURL,
            options: .forReplacing,
            error: &coordinationError
        ) { url in
            try? FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try? data.write(to: url, options: .atomic)
        }
    }

    private static let encoder: JSONEncoder = {
        let value = JSONEncoder()
        value.dateEncodingStrategy = .millisecondsSince1970
        value.outputFormatting = [.sortedKeys]
        return value
    }()

    private static let decoder: JSONDecoder = {
        let value = JSONDecoder()
        value.dateDecodingStrategy = .millisecondsSince1970
        return value
    }()
}

