import XCTest
@testable import CuckooCue

final class CueModelsTests: XCTestCase {
    func testDueTodayBecomesStrong() {
        let task = CueTask(runID: "run", title: "Today", dueAt: .now, sortOrder: 0)
        XCTAssertEqual(task.effectivePriority(), .strong)
    }

    func testQuietTasksDoNotAppearInWidget() {
        let run = CueRun(title: "List", sortOrder: 0, tasks: [
            CueTask(runID: "run", title: "Quiet", userPriority: .quiet, sortOrder: 0),
            CueTask(runID: "run", title: "Strong", userPriority: .strong, sortOrder: 1),
        ])
        XCTAssertEqual(CueSnapshot(runs: [run]).widgetCues.map(\.title), ["Strong"])
    }

    func testCompletedTasksDoNotAppearInWidget() {
        let run = CueRun(title: "List", sortOrder: 0, tasks: [
            CueTask(runID: "run", title: "Done", userPriority: .strong, sortOrder: 0, completedAt: .now),
        ])
        XCTAssertTrue(CueSnapshot(runs: [run]).widgetCues.isEmpty)
    }

    func testWidgetOrderingMatchesAndroidPriorityDueRunAndTaskOrder() {
        let later = Date(timeIntervalSince1970: 2_000)
        let sooner = Date(timeIntervalSince1970: 1_000)
        let firstRun = CueRun(id: "first", title: "First", sortOrder: 0, tasks: [
            CueTask(id: "medium", runID: "first", title: "Medium", userPriority: .medium, sortOrder: 0),
            CueTask(id: "later", runID: "first", title: "Later", userPriority: .strong, dueAt: later, sortOrder: 0),
            CueTask(id: "first-run", runID: "first", title: "First run", userPriority: .strong, sortOrder: 1),
        ])
        let secondRun = CueRun(id: "second", title: "Second", sortOrder: 1, tasks: [
            CueTask(id: "sooner", runID: "second", title: "Sooner", userPriority: .strong, dueAt: sooner, sortOrder: 0),
            CueTask(id: "second-run", runID: "second", title: "Second run", userPriority: .strong, sortOrder: 1),
        ])

        let titles = CueSnapshot(runs: [secondRun, firstRun]).widgetCues.map(\.title)

        XCTAssertEqual(titles, ["Sooner", "Later", "First run", "Second run", "Medium"])
    }

    func testWidgetCanBeScopedToOneRun() {
        let first = CueRun(id: "first", title: "First", sortOrder: 0, tasks: [
            CueTask(runID: "first", title: "First task", userPriority: .strong, sortOrder: 0),
        ])
        let second = CueRun(id: "second", title: "Second", sortOrder: 1, tasks: [
            CueTask(runID: "second", title: "Second task", userPriority: .strong, sortOrder: 0),
        ])

        XCTAssertEqual(
            CueSnapshot(runs: [first, second]).widgetCues(runID: "second", includeQuiet: false).map(\.title),
            ["Second task"]
        )
    }

    func testQuietTasksCanBeIncludedByWidgetConfiguration() {
        let run = CueRun(id: "run", title: "List", sortOrder: 0, tasks: [
            CueTask(runID: "run", title: "Quiet", userPriority: .quiet, sortOrder: 0),
        ])
        let snapshot = CueSnapshot(runs: [run])

        XCTAssertTrue(snapshot.widgetCues.isEmpty)
        XCTAssertEqual(snapshot.widgetCues(runID: nil, includeQuiet: true).map(\.title), ["Quiet"])
    }

    func testPageOffsetsAreIndependentByScope() {
        let snapshot = CueSnapshot(widgetPageOffsets: ["work-medium": 3, "home-medium": 6])

        XCTAssertEqual(snapshot.pageOffset(for: "work-medium"), 3)
        XCTAssertEqual(snapshot.pageOffset(for: "home-medium"), 6)
        XCTAssertEqual(snapshot.pageOffset(for: "other"), 0)
    }
}
