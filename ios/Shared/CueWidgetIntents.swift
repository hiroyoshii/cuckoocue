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

struct OpenCueQueueIntent: AppIntent {
    static var title: LocalizedStringResource = "Cuckoo Cueを開く"
    static var description = IntentDescription("Cuckoo Cueの項目一覧を開きます。")
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        .result()
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

struct AdvanceCuePageIntent: AppIntent {
    static var title: LocalizedStringResource = "次の項目を表示"

    @Parameter(title: "表示範囲") var scopeID: String
    @Parameter(title: "表示件数") var pageSize: Int

    init() {
        scopeID = "all-medium"
        pageSize = 3
    }

    init(scopeID: String, pageSize: Int) {
        self.scopeID = scopeID
        self.pageSize = pageSize
    }

    func perform() async throws -> some IntentResult {
        CueStorage.update { state in
            let current = state.widgetPageOffsets?[scopeID] ?? 0
            var offsets = state.widgetPageOffsets ?? [:]
            offsets[scopeID] = current + max(pageSize, 1)
            state.widgetPageOffsets = offsets
            state.undoTaskID = nil
            state.undoTitle = nil
        }
        WidgetCenter.shared.reloadTimelines(ofKind: CueWidgetConstants.kind)
        return .result()
    }
}
