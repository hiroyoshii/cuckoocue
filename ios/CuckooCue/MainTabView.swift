import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            RunListView()
                .tabItem { Label("リスト", systemImage: "checklist") }
            WidgetSettingsView()
                .tabItem { Label("ウィジェット", systemImage: "square.grid.2x2") }
        }
        .tint(.cueTeal)
    }
}

private struct RunListView: View {
    @EnvironmentObject private var store: CueStore
    @State private var presentingNewRun = false

    var body: some View {
        NavigationStack {
            Group {
                if store.snapshot.runs.isEmpty {
                    ContentUnavailableView(
                        "リストがありません",
                        systemImage: "checklist",
                        description: Text("小さなリストを作ると、優先度の高い項目がウィジェットに現れます。")
                    )
                } else {
                    List(store.snapshot.runs.filter { $0.archivedAt == nil }) { run in
                        NavigationLink(value: run.id) {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(run.title).font(.headline)
                                Text("未完了 \(run.tasks.filter { $0.completedAt == nil }.count)件")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .navigationTitle("Cuckoo Cue")
            .navigationDestination(for: String.self) { RunDetailView(runID: $0) }
            .toolbar {
                Button("リストを追加", systemImage: "plus") { presentingNewRun = true }
            }
            .sheet(isPresented: $presentingNewRun) { NewRunSheet() }
        }
    }
}

struct NewRunSheet: View {
    @EnvironmentObject private var store: CueStore
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""

    var body: some View {
        NavigationStack {
            Form { TextField("例：週末の用事", text: $title) }
                .navigationTitle("新しいリスト")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("作成") { store.createRun(title: title); dismiss() }
                            .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
        }
    }
}

struct RunDetailView: View {
    @EnvironmentObject private var store: CueStore
    let runID: String
    @State private var presentingTask = false

    private var run: CueRun? { store.snapshot.runs.first { $0.id == runID } }

    var body: some View {
        List {
            if let run {
                ForEach(run.tasks) { task in
                    Button { store.complete(taskID: task.id) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: task.completedAt == nil ? "square" : "checkmark.square.fill")
                                .foregroundStyle(task.completedAt == nil ? Color.secondary : .cueTeal)
                            Circle().fill(priorityColor(task.effectivePriority())).frame(width: 10, height: 10)
                            Text(task.title)
                                .foregroundStyle(task.completedAt == nil ? Color.primary : .secondary)
                                .strikethrough(task.completedAt != nil)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(task.title)、\(task.completedAt == nil ? "未完了" : "完了済み")")
                }
            }
        }
        .navigationTitle(run?.title ?? "リスト")
        .toolbar { Button("項目を追加", systemImage: "plus") { presentingTask = true } }
        .sheet(isPresented: $presentingTask) { NewTaskSheet(runID: runID) }
    }

    private func priorityColor(_ priority: CuePriority) -> Color {
        priority == .strong ? .cueTeal : priority == .medium ? .cueGreen : .secondary
    }
}

struct NewTaskSheet: View {
    @EnvironmentObject private var store: CueStore
    @Environment(\.dismiss) private var dismiss
    let runID: String
    @State private var title = ""
    @State private var priority: CuePriority? = .medium
    @State private var hasDueDate = false
    @State private var dueAt = Date()

    var body: some View {
        NavigationStack {
            Form {
                TextField("項目", text: $title)
                Picker("優先度", selection: $priority) {
                    Text("期限から自動").tag(CuePriority?.none)
                    ForEach(CuePriority.allCases) { Text($0.label).tag(Optional($0)) }
                }
                Toggle("期限を設定", isOn: $hasDueDate)
                if hasDueDate { DatePicker("期限", selection: $dueAt, displayedComponents: .date) }
            }
            .navigationTitle("新しい項目")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("追加") {
                        store.addTask(runID: runID, title: title, priority: priority, dueAt: hasDueDate ? dueAt : nil)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

struct WidgetSettingsView: View {
    @EnvironmentObject private var store: CueStore

    var body: some View {
        NavigationStack {
            Form {
                Section("外観") {
                    Picker("テーマ", selection: Binding(
                        get: { store.snapshot.widgetTheme },
                        set: store.setTheme
                    )) {
                        ForEach(WidgetTheme.allCases) { Text($0.label).tag($0) }
                    }
                    Picker("文字サイズ", selection: Binding(
                        get: { store.snapshot.widgetTextScale },
                        set: store.setTextScale
                    )) {
                        ForEach(WidgetTextScale.allCases) { Text($0.label).tag($0) }
                    }
                }
                Section("プレビュー") {
                    NavigationLink("全サイズを確認") { ScreenshotGalleryView() }
                }
                Section {
                    Text("ホーム画面を長押しして、Cuckoo Cueウィジェットを追加してください。")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("ウィジェット")
        }
    }
}

extension Color {
    static let cueTeal = Color(red: 0.31, green: 0.56, blue: 0.53)
    static let cueGreen = Color(red: 0.44, green: 0.56, blue: 0.36)
}
