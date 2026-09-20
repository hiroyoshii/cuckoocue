import Foundation
import WidgetKit

@MainActor
final class CueStore: ObservableObject {
    @Published private(set) var snapshot: CueSnapshot
    var onRunMutation: ((String) -> Void)?

    init() {
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("--ui-testing") {
            CueStorage.resetForUITesting(CueSnapshot.screenshotState(arguments: arguments))
        }
        snapshot = CueStorage.load()
    }

    @discardableResult
    func createRun(title: String) -> String? {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return nil }
        let runID = UUID().uuidString
        commit(runID: runID) { state in
            let nextOrder = (state.runs.map(\.sortOrder).max() ?? -1) + 1
            state.runs.append(CueRun(id: runID, title: clean, sortOrder: nextOrder))
        }
        return runID
    }

    @discardableResult
    func addTask(
        runID: String,
        title: String,
        priority: CuePriority?,
        availableFrom: Date? = nil,
        dueAt: Date?
    ) -> String? {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, validDateRange(availableFrom: availableFrom, dueAt: dueAt) else { return nil }
        let taskID = UUID().uuidString
        var added = false
        commit(runID: runID) { state in
            guard let runIndex = state.runs.firstIndex(where: { $0.id == runID }) else { return }
            let order = (state.runs[runIndex].tasks.map(\.sortOrder).max() ?? -1) + 1
            state.runs[runIndex].tasks.append(
                CueTask(
                    id: taskID,
                    runID: runID,
                    title: clean,
                    userPriority: priority,
                    availableFrom: availableFrom,
                    dueAt: dueAt,
                    sortOrder: order
                )
            )
            state.runs[runIndex].completedAnchorAt = nil
            state.runs[runIndex].updatedAt = .now
            added = true
        }
        return added ? taskID : nil
    }

    @discardableResult
    func updateTask(
        taskID: String,
        title: String,
        priority: CuePriority?,
        availableFrom: Date?,
        dueAt: Date?
    ) -> Bool {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, validDateRange(availableFrom: availableFrom, dueAt: dueAt) else { return false }
        var updated = false
        let runID = runID(containingTask: taskID)
        commit(runID: runID) { state in
            for runIndex in state.runs.indices {
                guard let taskIndex = state.runs[runIndex].tasks.firstIndex(where: { $0.id == taskID }) else {
                    continue
                }
                state.runs[runIndex].tasks[taskIndex].title = clean
                state.runs[runIndex].tasks[taskIndex].userPriority = priority
                state.runs[runIndex].tasks[taskIndex].availableFrom = availableFrom
                state.runs[runIndex].tasks[taskIndex].dueAt = dueAt
                state.runs[runIndex].tasks[taskIndex].updatedAt = .now
                state.runs[runIndex].updatedAt = .now
                updated = true
                break
            }
        }
        return updated
    }

    func deleteTask(taskID: String) {
        let runID = runID(containingTask: taskID)
        commit(runID: runID) { state in
            for runIndex in state.runs.indices {
                let before = state.runs[runIndex].tasks.count
                state.runs[runIndex].tasks.removeAll { $0.id == taskID }
                guard state.runs[runIndex].tasks.count != before else { continue }
                refreshCompletion(of: &state.runs[runIndex], at: .now)
                if state.undoTaskID == taskID {
                    state.undoTaskID = nil
                    state.undoTitle = nil
                }
                break
            }
        }
    }

    func complete(taskID: String) {
        let runID = runID(containingTask: taskID)
        commit(runID: runID) { state in
            for runIndex in state.runs.indices {
                guard let taskIndex = state.runs[runIndex].tasks.firstIndex(where: { $0.id == taskID }) else { continue }
                guard state.runs[runIndex].tasks[taskIndex].completedAt == nil else { break }
                let now = Date.now
                state.runs[runIndex].tasks[taskIndex].completedAt = now
                state.runs[runIndex].tasks[taskIndex].updatedAt = now
                state.undoTaskID = taskID
                state.undoTitle = state.runs[runIndex].tasks[taskIndex].title
                refreshCompletion(of: &state.runs[runIndex], at: now)
                break
            }
        }
    }

    func undoComplete(taskID: String) {
        let runID = runID(containingTask: taskID)
        commit(runID: runID) { state in
            undoComplete(taskID: taskID, in: &state)
        }
    }

    func undo() {
        guard let taskID = snapshot.undoTaskID else { return }
        let runID = runID(containingTask: taskID)
        commit(runID: runID) { state in
            undoComplete(taskID: taskID, in: &state)
        }
    }

    @discardableResult
    func restoreRun(runID: String) -> Bool {
        var restored = false
        commit(runID: runID) { state in
            guard let runIndex = state.runs.firstIndex(where: { $0.id == runID }),
                  state.runs[runIndex].archivedAt != nil else { return }
            state.runs[runIndex].archivedAt = nil
            state.runs[runIndex].updatedAt = .now
            restored = true
        }
        return restored
    }

    @discardableResult
    func reuseCompletedRun(runID: String) -> String? {
        guard let source = snapshot.runs.first(where: { $0.id == runID }) else { return nil }
        let completed = source.tasks
            .sorted { $0.sortOrder < $1.sortOrder }
            .filter { !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        guard !completed.isEmpty, completed.allSatisfy({ $0.completedAt != nil }) else { return nil }

        let newRunID = UUID().uuidString
        let now = Date.now
        commit(runID: newRunID) { state in
            let nextOrder = (state.runs.map(\.sortOrder).max() ?? -1) + 1
            let tasks = completed.enumerated().map { index, task in
                CueTask(
                    runID: newRunID,
                    title: task.title,
                    userPriority: nil,
                    availableFrom: nil,
                    dueAt: nil,
                    sortOrder: index,
                    completedAt: nil,
                    createdAt: now,
                    updatedAt: now
                )
            }
            state.runs.append(
                CueRun(
                    id: newRunID,
                    title: source.title,
                    sortOrder: nextOrder,
                    createdAt: now,
                    updatedAt: now,
                    tasks: tasks
                )
            )
        }
        return newRunID
    }

    func setTheme(_ theme: WidgetTheme) {
        commit { $0.widgetTheme = theme }
    }

    func setTextScale(_ scale: WidgetTextScale) {
        commit { $0.widgetTextScale = scale }
    }

    @discardableResult
    func insertReceivedRun(_ run: CueRun) -> Bool {
        guard !snapshot.runs.contains(where: { $0.id == run.id }) else { return false }
        snapshot = CueStorage.update { state in
            guard !state.runs.contains(where: { $0.id == run.id }) else { return }
            state.runs.append(run)
        }
        WidgetCenter.shared.reloadTimelines(ofKind: CueWidgetConstants.kind)
        return true
    }

    func reloadFromStorage() {
        let stored = CueStorage.load()
        if stored != snapshot { snapshot = stored }
    }

    private func commit(runID: String? = nil, _ mutation: (inout CueSnapshot) -> Void) {
        let previousRun = runID.flatMap { id in snapshot.runs.first(where: { $0.id == id }) }
        snapshot = CueStorage.update(mutation)
        let currentRun = runID.flatMap { id in snapshot.runs.first(where: { $0.id == id }) }
        if let runID, previousRun != currentRun {
            CueSyncMetadataStore.markPending(runID: runID)
            onRunMutation?(runID)
        }
        WidgetCenter.shared.reloadTimelines(ofKind: CueWidgetConstants.kind)
    }

    private func runID(containingTask taskID: String) -> String? {
        snapshot.runs.first(where: { run in run.tasks.contains(where: { $0.id == taskID }) })?.id
    }

    private func validDateRange(availableFrom: Date?, dueAt: Date?) -> Bool {
        guard let availableFrom, let dueAt else { return true }
        let calendar = Calendar.current
        return calendar.startOfDay(for: availableFrom) <= calendar.startOfDay(for: dueAt)
    }

    private func undoComplete(taskID: String, in state: inout CueSnapshot) {
        for runIndex in state.runs.indices {
            guard let taskIndex = state.runs[runIndex].tasks.firstIndex(where: { $0.id == taskID }),
                  state.runs[runIndex].tasks[taskIndex].completedAt != nil else { continue }
            let now = Date.now
            state.runs[runIndex].tasks[taskIndex].completedAt = nil
            state.runs[runIndex].tasks[taskIndex].updatedAt = now
            refreshCompletion(of: &state.runs[runIndex], at: now)
            break
        }
        if state.undoTaskID == taskID {
            state.undoTaskID = nil
            state.undoTitle = nil
        }
    }

    private func refreshCompletion(of run: inout CueRun, at now: Date) {
        if !run.tasks.isEmpty && run.tasks.allSatisfy({ $0.completedAt != nil }) {
            run.completedAnchorAt = run.completedAnchorAt ?? now
        } else {
            run.completedAnchorAt = nil
        }
        run.updatedAt = now
    }
}

private extension CueSnapshot {
    static func screenshotState(arguments: [String]) -> CueSnapshot {
        var state = arguments.contains("state-many-runs") ? CueSnapshot.multiRunDemo : CueSnapshot.demo
        if arguments.contains("state-empty") {
            state.runs = []
        }
        if arguments.contains("state-completed-run"), !state.runs.isEmpty {
            for index in state.runs.indices {
                let completedAt = Date(timeIntervalSince1970: Double(index + 1))
                state.runs[index].completedAnchorAt = completedAt
                for taskIndex in state.runs[index].tasks.indices {
                    state.runs[index].tasks[taskIndex].completedAt = completedAt
                }
            }
        }
        if arguments.contains("state-dark") {
            state.widgetTheme = .dark
        }
        if arguments.contains("state-large-text") {
            state.widgetTextScale = .large
        }
        if arguments.contains("state-undo") {
            for runIndex in state.runs.indices {
                guard let taskIndex = state.runs[runIndex].tasks.firstIndex(where: { $0.id == "demo-1" }) else {
                    continue
                }
                state.runs[runIndex].tasks[taskIndex].completedAt = .now
                state.undoTaskID = "demo-1"
                state.undoTitle = state.runs[runIndex].tasks[taskIndex].title
            }
        }
        if arguments.contains("state-paged") {
            state.footerOffset = 3
        }
        if arguments.contains("state-priority-empty") {
            for runIndex in state.runs.indices {
                for taskIndex in state.runs[runIndex].tasks.indices {
                    state.runs[runIndex].tasks[taskIndex].userPriority = .quiet
                }
            }
        }
        return state
    }
}

enum CueWidgetConstants {
    static let kind = "CuckooCueWidget"
}
