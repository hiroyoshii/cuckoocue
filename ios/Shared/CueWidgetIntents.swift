import AppIntents
import WidgetKit

struct CompleteCueIntent: AppIntent {
    static var title: LocalizedStringResource = "項目を完了"
    static var description = IntentDescription("Cuckoo Cueの項目を完了します。")

    @Parameter(title: "項目ID") var taskID: String

    init() {}
    init(taskID: String) { self.taskID = taskID }

    func perform() async throws -> some IntentResult {
        CueStorage.update { state in
            for runIndex in state.runs.indices {
                guard let taskIndex = state.runs[runIndex].tasks.firstIndex(where: { $0.id == taskID }) else { continue }
                let task = state.runs[runIndex].tasks[taskIndex]
                guard task.completedAt == nil else { return }
                state.runs[runIndex].tasks[taskIndex].completedAt = .now
                state.runs[runIndex].tasks[taskIndex].updatedAt = .now
                state.undoTaskID = taskID
                state.undoTitle = task.title
                return
            }
        }
        WidgetCenter.shared.reloadTimelines(ofKind: CueWidgetConstants.kind)
        return .result()
    }
}

struct UndoCueIntent: AppIntent {
    static var title: LocalizedStringResource = "完了を戻す"

    func perform() async throws -> some IntentResult {
        CueStorage.update { state in
            guard let taskID = state.undoTaskID else { return }
            for runIndex in state.runs.indices {
                if let taskIndex = state.runs[runIndex].tasks.firstIndex(where: { $0.id == taskID }) {
                    state.runs[runIndex].tasks[taskIndex].completedAt = nil
                    state.runs[runIndex].tasks[taskIndex].updatedAt = .now
                }
            }
            state.undoTaskID = nil
            state.undoTitle = nil
        }
        WidgetCenter.shared.reloadTimelines(ofKind: CueWidgetConstants.kind)
        return .result()
    }
}

struct ToggleCueFilterIntent: AppIntent {
    static var title: LocalizedStringResource = "表示を絞り込む"
    @Parameter(title: "項目ID") var taskID: String

    init() {}
    init(taskID: String) { self.taskID = taskID }

    func perform() async throws -> some IntentResult {
        CueStorage.update { state in
            state.selectedFilterTaskID = state.selectedFilterTaskID == taskID ? nil : taskID
            state.undoTaskID = nil
            state.undoTitle = nil
        }
        WidgetCenter.shared.reloadTimelines(ofKind: CueWidgetConstants.kind)
        return .result()
    }
}

struct AdvanceCuePageIntent: AppIntent {
    static var title: LocalizedStringResource = "次の項目を表示"

    func perform() async throws -> some IntentResult {
        CueStorage.update { state in
            let count = max(state.widgetCues.count, 1)
            state.footerOffset = (state.footerOffset + 1) % count
            state.undoTaskID = nil
            state.undoTitle = nil
        }
        WidgetCenter.shared.reloadTimelines(ofKind: CueWidgetConstants.kind)
        return .result()
    }
}

