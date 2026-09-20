import SwiftUI

struct MainTabView: View {
    var body: some View {
        RunListView()
            .tint(Color.cueTeal)
    }
}

private struct RunListView: View {
    @EnvironmentObject private var store: CueStore
    @State private var presentingNewRun = false
    @State private var presentingWidgetSettings = false
    @State private var path: [String] = []

    private var activeRuns: [CueRun] {
        store.snapshot.runs.filter { $0.archivedAt == nil && $0.completedAnchorAt == nil }
    }

    private var latestCompletedRun: CueRun? {
        store.snapshot.runs
            .filter { $0.archivedAt == nil && $0.completedAnchorAt != nil }
            .max { ($0.completedAnchorAt ?? .distantPast) < ($1.completedAnchorAt ?? .distantPast) }
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if activeRuns.isEmpty {
                    EmptyRunSearchView(hasCompletedRun: latestCompletedRun != nil)
                        .listRowInsets(EdgeInsets(top: 28, leading: 20, bottom: 28, trailing: 20))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                } else {
                    Section("実行中") {
                        ForEach(activeRuns) { run in
                            NavigationLink(value: run.id) {
                                RunRow(run: run, completed: false)
                            }
                        }
                    }
                }

                if let completedRun = latestCompletedRun {
                    Section("最近完了") {
                        NavigationLink(value: completedRun.id) {
                            RunRow(run: completedRun, completed: true)
                        }

                        Link(destination: CuckooCueWeb.historyURL) {
                            Label("完了履歴からもう一度使う", systemImage: "arrow.up.right")
                                .frame(maxWidth: .infinity, alignment: .center)
                        }
                        .accessibilityHint("Webの完了履歴を開きます")
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Cuckoo Cue")
            .navigationDestination(for: String.self) { RunDetailView(runID: $0) }
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if !activeRuns.isEmpty {
                        Link(destination: CuckooCueWeb.homeURL) {
                            Label("Webでタスクを探す", systemImage: "magnifyingglass")
                        }
                        .accessibilityHint("Webの検索画面を開きます")
                    }

                    Button("新しいリストを作る", systemImage: "plus") {
                        presentingNewRun = true
                    }

                    Button("Widget設定", systemImage: "square.grid.2x2") {
                        presentingWidgetSettings = true
                    }
                }
            }
            .sheet(isPresented: $presentingNewRun) { NewRunSheet() }
            .sheet(isPresented: $presentingWidgetSettings) {
                WidgetSettingsView(allowsDismiss: true)
            }
            .onOpenURL { url in
                guard url.scheme == "cuckoocue", url.host == "queue" else { return }
                let runID = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                    .queryItems?
                    .first(where: { $0.name == "run" })?
                    .value
                if let runID, store.snapshot.runs.contains(where: { $0.id == runID && $0.archivedAt == nil }) {
                    path = [runID]
                }
            }
        }
    }
}

private struct RunRow: View {
    let run: CueRun
    let completed: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(run.title)
                .font(.headline)
            Text(statusText)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }

    private var statusText: String {
        if completed {
            return "完了済み・\(run.tasks.count)件"
        }
        return "未完了 \(run.tasks.filter { $0.completedAt == nil }.count)件"
    }
}

private struct EmptyRunSearchView: View {
    let hasCompletedRun: Bool

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "checklist")
                .font(.system(size: 34, weight: .regular))
                .foregroundStyle(Color.cueTeal)
                .accessibilityHidden(true)
            Text(hasCompletedRun ? "実行中のリストはありません" : "リストを始めましょう")
                .font(.headline)
            Text("Webで自分に合う段取りを探すか、右上の＋から新しいリストを作れます。")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Link(destination: CuckooCueWeb.homeURL) {
                Label("Webでタスクを探す", systemImage: "magnifyingglass")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .accessibilityHint("Webの検索画面を開きます")
        }
        .frame(maxWidth: .infinity)
    }
}

private enum CuckooCueWeb {
    static let homeURL = URL(string: "https://cuckoocue.hiyozoo.com")!
    static let historyURL = URL(string: "https://cuckoocue.hiyozoo.com/?view=history")!
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
                Section("このリスト") {
                    ForEach(run.tasks) { task in
                        Button { store.complete(taskID: task.id) } label: {
                            HStack(spacing: 12) {
                                Image(systemName: task.completedAt == nil ? "square" : "checkmark.square.fill")
                                    .foregroundStyle(task.completedAt == nil ? Color.secondary : Color.cueTeal)
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
        }
        .navigationTitle(run?.title ?? "リスト")
        .toolbar { Button("項目を追加", systemImage: "plus") { presentingTask = true } }
        .sheet(isPresented: $presentingTask) { NewTaskSheet(runID: runID) }
    }

    private func priorityColor(_ priority: CuePriority) -> Color {
        priority == .strong ? Color.cueTeal : priority == .medium ? Color.cueGreen : Color.secondary
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

    private var effectivePriority: CuePriority {
        if let priority { return priority }
        return CueTask(runID: runID, title: title, dueAt: hasDueDate ? dueAt : nil, sortOrder: 0)
            .effectivePriority()
    }

    private var widgetHint: String {
        switch effectivePriority {
        case .strong, .medium:
            return "このCueはホーム画面に出ます。"
        case .quiet:
            return "今はホーム画面に出ません。強・中にするか、近い期限を設定すると表示されます。"
        }
    }

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
                Section("ホーム画面") {
                    Text(widgetHint)
                        .foregroundStyle(effectivePriority == .quiet ? Color.secondary : Color.cueTeal)
                }
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
    @Environment(\.dismiss) private var dismiss
    var allowsDismiss = false

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
                Section {
                    Text("ホーム画面を長押しして、Cuckoo Cueウィジェットを追加してください。")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("ウィジェット")
            .toolbar {
                if allowsDismiss {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("完了") { dismiss() }
                    }
                }
            }
        }
    }
}

extension Color {
    static let cueTeal = Color(red: 0.31, green: 0.56, blue: 0.53)
    static let cueGreen = Color(red: 0.44, green: 0.56, blue: 0.36)
}
