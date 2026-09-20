import XCTest
@testable import CuckooCue

@MainActor
final class CueStoreTests: XCTestCase {
    func testTaskCanBeEditedAndInvalidDateRangeIsRejected() {
        let original = CueTask(id: "task", runID: "run", title: "Before", userPriority: .quiet, sortOrder: 0)
        let store = makeStore(CueSnapshot(runs: [CueRun(id: "run", title: "List", sortOrder: 0, tasks: [original])]))
        let start = Date(timeIntervalSince1970: 1_000)
        let due = Date(timeIntervalSince1970: 2_000)

        XCTAssertTrue(store.updateTask(
            taskID: "task",
            title: "After",
            priority: .strong,
            availableFrom: start,
            dueAt: due
        ))
        XCTAssertEqual(store.snapshot.runs[0].tasks[0].title, "After")
        XCTAssertEqual(store.snapshot.runs[0].tasks[0].userPriority, .strong)
        XCTAssertEqual(store.snapshot.runs[0].tasks[0].availableFrom, start)
        XCTAssertEqual(store.snapshot.runs[0].tasks[0].dueAt, due)

        XCTAssertFalse(store.updateTask(
            taskID: "task",
            title: "Invalid",
            priority: .medium,
            availableFrom: Date(timeIntervalSince1970: 200_000),
            dueAt: due
        ))
        XCTAssertEqual(store.snapshot.runs[0].tasks[0].title, "After")
    }

    func testCompletingLastTaskSetsRunCompletionAndUndoRestoresIt() {
        let completedAt = Date(timeIntervalSince1970: 1_000)
        let tasks = [
            CueTask(id: "done", runID: "run", title: "Done", sortOrder: 0, completedAt: completedAt),
            CueTask(id: "pending", runID: "run", title: "Pending", sortOrder: 1),
        ]
        let store = makeStore(CueSnapshot(runs: [CueRun(id: "run", title: "List", sortOrder: 0, tasks: tasks)]))

        store.complete(taskID: "pending")
        XCTAssertNotNil(store.snapshot.runs[0].completedAnchorAt)

        store.undoComplete(taskID: "pending")
        XCTAssertNil(store.snapshot.runs[0].completedAnchorAt)
        XCTAssertNil(store.snapshot.runs[0].tasks.first(where: { $0.id == "pending" })?.completedAt)
    }

    func testPendingTasksCanBeReorderedWithoutMovingCompletedTasksIntoPendingSection() {
        let completedAt = Date(timeIntervalSince1970: 1_000)
        let tasks = [
            CueTask(id: "first", runID: "run", title: "First", sortOrder: 0),
            CueTask(id: "done", runID: "run", title: "Done", sortOrder: 1, completedAt: completedAt),
            CueTask(id: "second", runID: "run", title: "Second", sortOrder: 2),
        ]
        let store = makeStore(CueSnapshot(runs: [CueRun(id: "run", title: "List", sortOrder: 0, tasks: tasks)]))

        store.movePendingTasks(runID: "run", fromOffsets: IndexSet(integer: 0), toOffset: 2)

        XCTAssertEqual(store.snapshot.runs[0].tasks.map(\.id), ["second", "first", "done"])
        XCTAssertEqual(store.snapshot.runs[0].tasks.map(\.sortOrder), [0, 1, 2])
    }

    func testRunCanBeRenamedInline() {
        let store = makeStore(CueSnapshot(runs: [CueRun(id: "run", title: "Before", sortOrder: 0)]))

        XCTAssertTrue(store.renameRun(runID: "run", title: "After"))
        XCTAssertEqual(store.snapshot.runs[0].title, "After")
        XCTAssertFalse(store.renameRun(runID: "run", title: "   "))
        XCTAssertEqual(store.snapshot.runs[0].title, "After")
    }

    func testReuseCopiesOnlyTextAndResetsExecutionState() {
        let completedAt = Date(timeIntervalSince1970: 2_000)
        let source = CueRun(
            id: "source",
            title: "Trip",
            sortOrder: 0,
            completedAnchorAt: completedAt,
            tasks: [
                CueTask(
                    id: "second",
                    runID: "source",
                    title: "Second",
                    userPriority: .strong,
                    availableFrom: Date(timeIntervalSince1970: 500),
                    dueAt: Date(timeIntervalSince1970: 1_500),
                    sortOrder: 1,
                    completedAt: completedAt
                ),
                CueTask(id: "first", runID: "source", title: "First", userPriority: .quiet, sortOrder: 0, completedAt: completedAt),
            ]
        )
        let store = makeStore(CueSnapshot(runs: [source]))
        let storedSource = store.snapshot.runs[0]

        let newRunID = store.reuseCompletedRun(runID: "source")
        let copied = store.snapshot.runs.first { $0.id == newRunID }

        XCTAssertNotNil(newRunID)
        XCTAssertEqual(copied?.title, "Trip")
        XCTAssertEqual(copied?.tasks.map(\.title), ["First", "Second"])
        XCTAssertTrue(copied?.tasks.allSatisfy {
            $0.userPriority == nil && $0.availableFrom == nil && $0.dueAt == nil && $0.completedAt == nil
        } == true)
        XCTAssertEqual(store.snapshot.runs.first(where: { $0.id == "source" }), storedSource)
    }

    func testLegacyArchivedRunCanBeRestoredWithoutAddingArchiveUI() {
        let archived = CueRun(id: "archived", title: "Old", sortOrder: 0, archivedAt: .now)
        let store = makeStore(CueSnapshot(runs: [archived]))

        XCTAssertTrue(store.restoreRun(runID: "archived"))
        XCTAssertNil(store.snapshot.runs[0].archivedAt)
        XCTAssertFalse(store.restoreRun(runID: "archived"))
    }

    func testReceivingSameRunIDDoesNotOverwriteLocalEdits() {
        let local = CueRun(id: "shared", title: "ローカル編集", sortOrder: 0, tasks: [])
        let store = makeStore(CueSnapshot(runs: [local]))
        let remote = CueRun(id: "shared", title: "Web版", sortOrder: 0, tasks: [])

        XCTAssertFalse(store.insertReceivedRun(remote))
        XCTAssertEqual(store.snapshot.runs.first?.title, "ローカル編集")
        XCTAssertEqual(store.snapshot.runs.count, 1)
    }

    private func makeStore(_ snapshot: CueSnapshot) -> CueStore {
        CueStorage.resetForUITesting(snapshot)
        return CueStore()
    }
}
