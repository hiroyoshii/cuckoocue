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
}

