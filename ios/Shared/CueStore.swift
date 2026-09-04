import Foundation
import WidgetKit

@MainActor
final class CueStore: ObservableObject {
    @Published private(set) var snapshot: CueSnapshot

    init() {
        if ProcessInfo.processInfo.arguments.contains("--ui-testing") {
            CueStorage.resetForUITesting()
        }
        snapshot = CueStorage.load()
    }

    func createRun(title: String) {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        commit { state in
            state.runs.append(CueRun(title: clean, sortOrder: state.runs.count))
        }
    }

    func addTask(runID: String, title: String, priority: CuePriority?, dueAt: Date?) {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        commit { state in
            guard let runIndex = state.runs.firstIndex(where: { $0.id == runID }) else { return }
            let order = state.runs[runIndex].tasks.count
            state.runs[runIndex].tasks.append(
                CueTask(runID: runID, title: clean, userPriority: priority, dueAt: dueAt, sortOrder: order)
            )
        }
    }

    func complete(taskID: String) {
        commit { state in
            for runIndex in state.runs.indices {
                guard let taskIndex = state.runs[runIndex].tasks.firstIndex(where: { $0.id == taskID }) else { continue }
                state.runs[runIndex].tasks[taskIndex].completedAt = .now
                state.runs[runIndex].tasks[taskIndex].updatedAt = .now
                state.undoTaskID = taskID
                state.undoTitle = state.runs[runIndex].tasks[taskIndex].title
                break
            }
        }
    }

    func undo() {
        guard let taskID = snapshot.undoTaskID else { return }
        commit { state in
            for runIndex in state.runs.indices {
                if let taskIndex = state.runs[runIndex].tasks.firstIndex(where: { $0.id == taskID }) {
                    state.runs[runIndex].tasks[taskIndex].completedAt = nil
                    state.runs[runIndex].tasks[taskIndex].updatedAt = .now
                }
            }
            state.undoTaskID = nil
            state.undoTitle = nil
        }
    }

    func setTheme(_ theme: WidgetTheme) {
        commit { $0.widgetTheme = theme }
    }

    func setTextScale(_ scale: WidgetTextScale) {
        commit { $0.widgetTextScale = scale }
    }

    private func commit(_ mutation: (inout CueSnapshot) -> Void) {
        snapshot = CueStorage.update(mutation)
        WidgetCenter.shared.reloadTimelines(ofKind: CueWidgetConstants.kind)
    }
}

enum CueWidgetConstants {
    static let kind = "CuckooCueWidget"
}

