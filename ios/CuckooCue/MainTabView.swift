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
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: String.self) { runID in
                RunDetailView(runID: runID) { reusedRunID in
                    path = [reusedRunID]
                }
            }
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Image("CuckooCueBrandLockup")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 116, height: 38)
                        .padding(.horizontal, 4)
                        .background(Color(red: 1, green: 0.965, blue: 0.906))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                        .accessibilityLabel("Cuckoo Cue")
                        .accessibilityIdentifier("brand-lockup")
                }
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
            .sheet(isPresented: $presentingNewRun) {
                NewRunSheet { runID in path = [runID] }
            }
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
            Text(completed ? "完了済み・\(run.tasks.count)件" : "未完了 \(run.tasks.filter { $0.completedAt == nil }.count)件")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
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
    var onCreated: (String) -> Void = { _ in }
    @State private var title = ""

    var body: some View {
        NavigationStack {
            Form { TextField("例：週末の用事", text: $title) }
                .navigationTitle("新しいリスト")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("作成") {
                            guard let runID = store.createRun(title: title) else { return }
                            dismiss()
                            onCreated(runID)
                        }
                        .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
        }
    }
}

extension Color {
    static let cueTeal = Color(red: 0.31, green: 0.56, blue: 0.53)
    static let cueGreen = Color(red: 0.44, green: 0.56, blue: 0.36)
}
