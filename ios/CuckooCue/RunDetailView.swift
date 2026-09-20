import SwiftUI

struct RunDetailView: View {
    @EnvironmentObject private var store: CueStore
    let runID: String
    var onOpenRun: (String) -> Void = { _ in }
    @State private var presentingNewTask = false
    @State private var editingTask: CueTask?

    private var run: CueRun? { store.snapshot.runs.first { $0.id == runID } }
    private var pendingTasks: [CueTask] { run?.tasks.filter { $0.completedAt == nil } ?? [] }
    private var completedTasks: [CueTask] { run?.tasks.filter { $0.completedAt != nil } ?? [] }

    var body: some View {
        List {
            if let run {
                if run.tasks.isEmpty {
                    ContentUnavailableView(
                        "項目がありません",
                        systemImage: "checklist",
                        description: Text("右上の＋から最初の項目を追加できます。")
                    )
                }
                if !pendingTasks.isEmpty {
                    Section("未完了") {
                        ForEach(pendingTasks) { task in taskRow(task) }
                    }
                }
                if !completedTasks.isEmpty {
                    Section("完了済み") {
                        ForEach(completedTasks) { task in taskRow(task) }
                    }
                }
                if !run.tasks.isEmpty && pendingTasks.isEmpty {
                    CompletedRunActions {
                        guard let reusedRunID = store.reuseCompletedRun(runID: runID) else { return }
                        onOpenRun(reusedRunID)
                    }
                }
            }
        }
        .navigationTitle(run?.title ?? "リスト")
        .toolbar {
            Button("項目を追加", systemImage: "plus") { presentingNewTask = true }
        }
        .sheet(isPresented: $presentingNewTask) {
            TaskEditorSheet(runID: runID)
        }
        .sheet(item: $editingTask) { task in
            TaskEditorSheet(runID: runID, task: task)
        }
    }

    @ViewBuilder
    private func taskRow(_ task: CueTask) -> some View {
        TaskRow(
            task: task,
            onToggleCompletion: {
                if task.completedAt == nil {
                    store.complete(taskID: task.id)
                } else {
                    store.undoComplete(taskID: task.id)
                }
            },
            onEdit: { editingTask = task }
        )
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button("削除", role: .destructive) { store.deleteTask(taskID: task.id) }
        }
    }
}

private struct TaskRow: View {
    let task: CueTask
    let onToggleCompletion: () -> Void
    let onEdit: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onToggleCompletion) {
                Image(systemName: task.completedAt == nil ? "square" : "checkmark.square.fill")
                    .font(.title3)
                    .foregroundStyle(task.completedAt == nil ? Color.secondary : Color.cueTeal)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(task.completedAt == nil ? "\(task.title)を完了" : "\(task.title)の完了を取り消す")

            Button(action: onEdit) {
                HStack(spacing: 10) {
                    Circle()
                        .fill(priorityColor(task.effectivePriority()))
                        .frame(width: 10, height: 10)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(task.title)
                            .foregroundStyle(task.completedAt == nil ? Color.primary : .secondary)
                            .strikethrough(task.completedAt != nil)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if !metadata.isEmpty {
                            Text(metadata)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(task.title)を編集、優先度\(task.effectivePriority().label)\(metadata.isEmpty ? "" : "、\(metadata)")")
        }
        .padding(.vertical, 3)
        .accessibilityIdentifier("task-row-\(task.id)")
    }

    private var metadata: String {
        var values: [String] = []
        if let availableFrom = task.availableFrom { values.append("開始 \(Self.dateFormatter.string(from: availableFrom))") }
        if let dueAt = task.dueAt { values.append("期限 \(Self.dateFormatter.string(from: dueAt))") }
        return values.joined(separator: "・")
    }

    private func priorityColor(_ priority: CuePriority) -> Color {
        priority == .strong ? Color.cueTeal : priority == .medium ? Color.cueGreen : Color.secondary
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.setLocalizedDateFormatFromTemplate("Md")
        return formatter
    }()
}

private struct CompletedRunActions: View {
    let onReuse: () -> Void

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                Text("このリストは完了しました")
                    .font(.headline)
                Button(action: onReuse) {
                    Text("もう一度使う")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                Text("本文だけを新しいリストへコピーし、日付・優先度・完了状態をリセットします。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
        }
    }
}
