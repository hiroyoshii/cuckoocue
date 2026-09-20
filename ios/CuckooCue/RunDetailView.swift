import SwiftUI

struct RunDetailView: View {
    @EnvironmentObject private var store: CueStore
    @EnvironmentObject private var transfer: RunTransferController
    @Environment(\.openURL) private var openURL
    let runID: String
    var onOpenRun: (String) -> Void = { _ in }
    var initiallyExpandedTaskID: String?
    @State private var newTaskTitle = ""
    @State private var runTitle = ""
    @State private var expandedTaskID: String?
    @State private var showCompleted = false
    @State private var editMode: EditMode = .inactive
    @State private var preparingWeb = false
    @State private var webError: String?
    @FocusState private var runTitleFocused: Bool

    private var run: CueRun? { store.snapshot.runs.first { $0.id == runID } }
    private var pendingTasks: [CueTask] {
        (run?.tasks ?? []).filter { $0.completedAt == nil }.sorted { $0.sortOrder < $1.sortOrder }
    }
    private var completedTasks: [CueTask] {
        (run?.tasks ?? []).filter { $0.completedAt != nil }.sorted { $0.sortOrder < $1.sortOrder }
    }
    private var completedTasksAreVisible: Bool { showCompleted || pendingTasks.isEmpty }

    var body: some View {
        List {
            if let run {
                Section {
                    TextField("リスト名", text: $runTitle)
                        .font(.largeTitle.bold())
                        .focused($runTitleFocused)
                        .submitLabel(.done)
                        .onSubmit(saveRunTitle)
                        .accessibilityIdentifier("run-title-editor")
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 8, leading: 20, bottom: 4, trailing: 20))

                Section {
                    NewTaskComposer(title: $newTaskTitle, onAdd: addTask)
                }

                if !pendingTasks.isEmpty {
                    Section("未完了") {
                        ForEach(pendingTasks) { task in
                            taskRow(task)
                        }
                        .onMove { fromOffsets, toOffset in
                            store.movePendingTasks(runID: runID, fromOffsets: fromOffsets, toOffset: toOffset)
                        }
                    }
                }

                if !completedTasks.isEmpty {
                    Section {
                        Button {
                            withAnimation { showCompleted.toggle() }
                        } label: {
                            HStack {
                                Text(completedTasksAreVisible ? "完了済みを閉じる" : "完了済み")
                                Spacer()
                                Text("\(completedTasks.count)")
                                    .foregroundStyle(.secondary)
                                Image(systemName: completedTasksAreVisible ? "chevron.up" : "chevron.down")
                                    .font(.caption.weight(.semibold))
                            }
                        }

                        if completedTasksAreVisible {
                            ForEach(completedTasks) { task in
                                taskRow(task)
                            }
                        }
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
        .navigationTitle("")
        .environment(\.editMode, $editMode)
        .toolbar {
            if pendingTasks.count > 1 {
                Button(editMode.isEditing ? "完了" : "並べ替え") {
                    withAnimation {
                        editMode = editMode.isEditing ? .inactive : .active
                    }
                }
                .accessibilityLabel(editMode.isEditing ? "並べ替えを完了" : "項目を並べ替える")
            }
        }
        .onAppear {
            runTitle = run?.title ?? ""
            expandedTaskID = initiallyExpandedTaskID
        }
        .onChange(of: run?.updatedAt) { _, _ in
            if !runTitleFocused { runTitle = run?.title ?? "" }
        }
        .onChange(of: runTitleFocused) { _, focused in
            if !focused { saveRunTitle() }
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
        InlineTaskRow(
            task: task,
            isExpanded: Binding(
                get: { expandedTaskID == task.id },
                set: { expandedTaskID = $0 ? task.id : nil }
            ),
            onToggleCompletion: {
                if task.completedAt == nil {
                    store.complete(taskID: task.id)
                } else {
                    store.undoComplete(taskID: task.id)
                }
            },
            onSave: { title, priority, availableFrom, dueAt in
                store.updateTask(
                    taskID: task.id,
                    title: title,
                    priority: priority,
                    availableFrom: availableFrom,
                    dueAt: dueAt
                )
            },
            onDelete: { store.deleteTask(taskID: task.id) }
        )
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button("削除", role: .destructive) { store.deleteTask(taskID: task.id) }
        }
    }

    private func addTask() {
        guard store.addTask(
            runID: runID,
            title: newTaskTitle,
            priority: nil,
            availableFrom: nil,
            dueAt: nil
        ) != nil else { return }
        newTaskTitle = ""
    }

    private func saveRunTitle() {
        guard !runTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            runTitle = run?.title ?? ""
            return
        }
        _ = store.renameRun(runID: runID, title: runTitle)
    }

    private func prepareCompletedTasksForWeb() {
        let taskIDs = completedTasks.map(\.id)
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
                        Text("もう一度使う").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                }
                Button(action: onPrepareWeb) {
                    HStack {
                        if isPreparingWeb { ProgressView() }
                        Text("再利用用に整える").frame(maxWidth: .infinity)
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
