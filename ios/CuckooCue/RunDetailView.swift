import SwiftUI

struct RunDetailView: View {
    @EnvironmentObject private var store: CueStore
    @EnvironmentObject private var transfer: RunTransferController
    @Environment(\.openURL) private var openURL
    let runID: String
    var onOpenRun: (String) -> Void = { _ in }
    @State private var presentingNewTask = false
    @State private var editingTask: CueTask?
    @State private var preparingWeb = false
    @State private var webError: String?

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
                if !completedTasks.isEmpty {
                    CompletedRunActions(
                        canReuseLocally: !run.tasks.isEmpty && pendingTasks.isEmpty,
                        isPreparingWeb: preparingWeb,
                        onReuse: {
                            guard let reusedRunID = store.reuseCompletedRun(runID: runID) else { return }
                            onOpenRun(reusedRunID)
                        },
                        onPrepareWeb: prepareCompletedTasksForWeb
                    )
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
        .alert("Webへ反映できませんでした", isPresented: Binding(
            get: { webError != nil },
            set: { if !$0 { webError = nil } }
        )) {
            Button("閉じる", role: .cancel) {}
        } message: {
            Text(webError ?? "")
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

    private func prepareCompletedTasksForWeb() {
        let taskIDs = completedTasks.sorted { $0.sortOrder < $1.sortOrder }.map(\.id)
        preparingWeb = true
        Task {
            defer { preparingWeb = false }
            do {
                let url = try await transfer.prepareForWeb(runID: runID, completedTaskIDs: taskIDs)
                openURL(url)
            } catch {
                webError = error.localizedDescription
            }
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
    let canReuseLocally: Bool
    let isPreparingWeb: Bool
    let onReuse: () -> Void
    let onPrepareWeb: () -> Void

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                Text(canReuseLocally ? "このリストは完了しました" : "完了した項目を再利用できます")
                    .font(.headline)
                if canReuseLocally {
                    Button(action: onReuse) {
                        Text("もう一度使う")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                }
                Button(action: onPrepareWeb) {
                    HStack {
                        if isPreparingWeb { ProgressView() }
                        Text("再利用用に整える")
                        .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.bordered)
                .disabled(isPreparingWeb)
                Text(canReuseLocally
                     ? "「もう一度使う」は本文だけを新しいリストへコピーします。Webでは完了した項目を編集して残せます。"
                     : "同期後、完了した項目だけをWebで編集して残せます。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
        }
    }
}
