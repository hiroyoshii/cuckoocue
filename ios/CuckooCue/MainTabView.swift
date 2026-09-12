import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            RunListView()
                .tabItem { Label("リスト", systemImage: "checklist") }
            WidgetSettingsView()
                .tabItem { Label("ウィジェット", systemImage: "square.grid.2x2") }
        }
        .tint(Color.cueTeal)
    }
}

private struct RunListView: View {
    @EnvironmentObject private var store: CueStore
    @State private var presentingNewRun = false
    @State private var path: [String] = []

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if store.snapshot.runs.isEmpty {
                    ContentUnavailableView(
                        "リストがありません",
                        systemImage: "checklist",
                        description: Text("小さなリストを作ると、優先度の高い項目がウィジェットに現れます。")
                    )
                } else {
                    List {
                        Section {
                            WidgetCuePreview(
                                rows: widgetPreviewRows(
                                    cues: Array(store.snapshot.widgetCues.prefix(3)),
                                    snapshot: store.snapshot,
                                    showsRunTitle: true
                                ),
                                totalCount: store.snapshot.widgetCues.count,
                                showsRunTitle: true,
                                emptyMessage: "強・中のCueが、Runをまたいでここからホーム画面へ戻ります。"
                            )
                        }

                        Section("やる") {
                            ForEach(store.snapshot.runs.filter { $0.archivedAt == nil }) { run in
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
                }
            }
            .navigationTitle("Cuckoo Cue")
            .navigationDestination(for: String.self) { RunDetailView(runID: $0) }
            .toolbar {
                Button("リストを追加", systemImage: "plus") { presentingNewRun = true }
            }
            .sheet(isPresented: $presentingNewRun) { NewRunSheet() }
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

private func widgetPreviewRows(cues: [CueTask], snapshot: CueSnapshot, showsRunTitle: Bool) -> [WidgetCuePreviewRowData] {
    cues.map { cue in
        WidgetCuePreviewRowData(
            id: cue.id,
            title: cue.title,
            runTitle: showsRunTitle ? snapshot.runTitle(for: cue) : "",
            dueLabel: widgetPreviewDueLabel(cue.dueAt),
            priority: cue.effectivePriority()
        )
    }
}

private func widgetPreviewDueLabel(_ date: Date?) -> String? {
    guard let date else { return nil }
    let components = Calendar(identifier: .gregorian).dateComponents([.month, .day], from: date)
    guard let month = components.month, let day = components.day else { return nil }
    return "\(month)/\(day)"
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
                Section {
                    WidgetCuePreview(
                        rows: widgetPreviewRows(
                            cues: Array(store.snapshot.widgetCues(runID: run.id, includeQuiet: false).prefix(3)),
                            snapshot: store.snapshot,
                            showsRunTitle: false
                        ),
                        totalCount: store.snapshot.widgetCues(runID: run.id, includeQuiet: false).count,
                        showsRunTitle: false,
                        emptyMessage: "このRunからWidgetに出るCueはありません。強・中にするとホーム画面へ戻ります。"
                    )
                }

                Section("このRun") {
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

private struct WidgetCuePreviewRowData: Identifiable {
    let id: String
    let title: String
    let runTitle: String
    let dueLabel: String?
    let priority: CuePriority
}

private struct WidgetCuePreview: View {
    let rows: [WidgetCuePreviewRowData]
    let totalCount: Int
    let showsRunTitle: Bool
    let emptyMessage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Widgetに出るCue")
                        .font(.subheadline.weight(.semibold))
                    Text(rows.isEmpty ? emptyMessage : "ホーム画面ではこの順に表示されます")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(totalCount)件")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.cueTeal)
            }

            ForEach(rows) { row in
                HStack(spacing: 9) {
                    Circle()
                        .fill(priorityColor(row.priority))
                        .frame(width: dotSize(row.priority), height: dotSize(row.priority))
                        .frame(width: 14, height: 14)
                    if showsRunTitle {
                        Text(row.runTitle)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color.cueTeal)
                            .lineLimit(1)
                            .frame(width: 64, alignment: .leading)
                    }
                    Text(row.title)
                        .font(.caption)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if let dueLabel = row.dueLabel {
                        Text(dueLabel)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if totalCount > rows.count {
                Text("ほか\(totalCount - rows.count)件")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private func priorityColor(_ priority: CuePriority) -> Color {
        switch priority {
        case .strong:
            return Color.cueTeal.opacity(0.62)
        case .medium:
            return Color.cueGreen.opacity(0.52)
        case .quiet:
            return Color.secondary.opacity(0.45)
        }
    }

    private func dotSize(_ priority: CuePriority) -> CGFloat {
        switch priority {
        case .strong:
            return 12
        case .medium:
            return 9
        case .quiet:
            return 6
        }
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
