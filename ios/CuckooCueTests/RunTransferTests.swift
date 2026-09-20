import XCTest
@testable import CuckooCue

final class RunTransferTests: XCTestCase {
    override func setUp() {
        super.setUp()
        CueSyncMetadataStore.resetForTesting()
    }

    func testStrictWebRunLink() {
        XCTAssertEqual(
            RunTransferLink.runID(from: URL(string: "https://cuckoocue.hiyozoo.com/import?run_id=run_123")!),
            "run_123"
        )
        XCTAssertNil(RunTransferLink.runID(from: URL(string: "https://cuckoocue.hiyozoo.com/import?run_id=a&run_id=b")!))
        XCTAssertNil(RunTransferLink.runID(from: URL(string: "https://example.com/import?run_id=run_123")!))
        XCTAssertNil(RunTransferLink.runID(from: URL(string: "https://cuckoocue.hiyozoo.com/import?run_id=bad%2Fid")!))
    }

    func testCompletedEditorLinkContainsOnlyIDs() {
        let url = RunTransferLink.completedEditorURL(runID: "run", taskIDs: ["first", "second"])

        XCTAssertEqual(url?.absoluteString, "https://cuckoocue.hiyozoo.com?run_id=run#edit_tasks=first,second")
        XCTAssertNil(RunTransferLink.completedEditorURL(runID: "run", taskIDs: []))
    }

    func testReceivesAndroidWebSnapshotWithoutChangingIDOrDates() async throws {
        let body = """
        {"run":{"id":"shared-run","title":"出発準備","source_cuebook_id":"book-1","target_anchor_day":1800000000000,"sort_order":2,"archived_at":null,"completed_anchor_at":null,"time_zone":"Asia/Tokyo","created_at":1790000000000,"updated_at":1790000001000,"tasks":[{"id":"task-1","title":"切符を確認","source_task_id":"source-1","user_priority":0,"available_from_at":1799000000000,"due_at":1800000000000,"sort_order":0,"completed_at":null,"created_at":1790000000000,"updated_at":1790000001000}]}}
        """.data(using: .utf8)!
        let client = RunAPIClient(baseURL: URL(string: "https://example.test")!) { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token")
            return (body, self.response(for: request, status: 200, headers: ["ETag": "\"v1\""]))
        }

        let received = try await client.receive(runID: "shared-run", token: "token")

        XCTAssertEqual(received.etag, "\"v1\"")
        XCTAssertEqual(received.run.id, "shared-run")
        XCTAssertEqual(received.run.sourceCuebookID, "book-1")
        XCTAssertEqual(received.run.timeZone, "Asia/Tokyo")
        XCTAssertEqual(try XCTUnwrap(received.run.targetAnchorDay).timeIntervalSince1970, 1_800_000_000, accuracy: 0.001)
        XCTAssertEqual(received.run.tasks.first?.id, "task-1")
        XCTAssertEqual(received.run.tasks.first?.sourceTaskID, "source-1")
        XCTAssertEqual(try XCTUnwrap(received.run.tasks.first?.dueAt).timeIntervalSince1970, 1_800_000_000, accuracy: 0.001)
    }

    func testSyncUsesETagAndAndroidFieldNames() async throws {
        var captured: URLRequest?
        let client = RunAPIClient(baseURL: URL(string: "https://example.test")!) { request in
            captured = request
            return (Data("{}".utf8), self.response(for: request, status: 200, headers: ["ETag": "\"v2\""]))
        }
        let run = CueRun(
            id: "run",
            title: "List",
            sourceCuebookID: "book",
            targetAnchorDay: Date(timeIntervalSince1970: 1_800_000_000),
            timeZone: "Asia/Tokyo",
            sortOrder: 0,
            tasks: [CueTask(id: "task", runID: "run", sourceTaskID: "source", title: "Task", userPriority: .strong, sortOrder: 0)]
        )

        let etag = try await client.sync(run: run, token: "token", etag: "\"v1\"")
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(captured?.httpBody)) as? [String: Any])
        let tasks = try XCTUnwrap(object["tasks"] as? [[String: Any]])

        XCTAssertEqual(etag, "\"v2\"")
        XCTAssertEqual(captured?.httpMethod, "PUT")
        XCTAssertEqual(captured?.value(forHTTPHeaderField: "If-Match"), "\"v1\"")
        XCTAssertEqual(object["source_cuebook_id"] as? String, "book")
        XCTAssertEqual((object["target_anchor_day"] as? NSNumber)?.int64Value, 1_800_000_000_000)
        XCTAssertEqual(tasks.first?["source_task_id"] as? String, "source")
    }

    func testOwnerCannotBeReassignedAcrossAccounts() {
        XCTAssertTrue(CueSyncMetadataStore.claim(runID: "run", ownerID: "owner-a"))
        XCTAssertFalse(CueSyncMetadataStore.claim(runID: "run", ownerID: "owner-b"))
        CueSyncMetadataStore.markPending(runID: "run")

        XCTAssertEqual(CueSyncMetadataStore.pendingRunIDs(ownerID: "owner-a"), ["run"])
        XCTAssertTrue(CueSyncMetadataStore.pendingRunIDs(ownerID: "owner-b").isEmpty)
    }

    private func response(for request: URLRequest, status: Int, headers: [String: String] = [:]) -> HTTPURLResponse {
        HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: headers)!
    }
}

final class CueStorageCompatibilityTests: XCTestCase {
    func testDecodesSnapshotWrittenBeforeM02AndM03Fields() throws {
        let oldJSON = """
        {"runs":[{"id":"legacy-run","title":"以前のリスト","sortOrder":0,"createdAt":1000,"updatedAt":2000,"tasks":[{"id":"legacy-task","runID":"legacy-run","title":"以前の項目","sortOrder":0,"createdAt":1000,"updatedAt":2000}]}],"footerOffset":1,"updatedAt":2000}
        """.data(using: .utf8)!

        let snapshot = try CueStorage.decode(oldJSON)

        XCTAssertEqual(snapshot.runs.first?.id, "legacy-run")
        XCTAssertNil(snapshot.runs.first?.sourceCuebookID)
        XCTAssertNil(snapshot.runs.first?.targetAnchorDay)
        XCTAssertNil(snapshot.runs.first?.timeZone)
        XCTAssertEqual(snapshot.runs.first?.tasks.first?.id, "legacy-task")
        XCTAssertNil(snapshot.runs.first?.tasks.first?.sourceTaskID)
        XCTAssertEqual(snapshot.widgetTheme, .system)
        XCTAssertEqual(snapshot.widgetTextScale, .standard)
    }
}
