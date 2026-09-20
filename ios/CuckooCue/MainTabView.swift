import SwiftUI

struct MainTabView: View {
    var body: some View {
        RunListView()
            .tint(Color.cueTeal)
    }
}

private struct RunListView: View {
    @EnvironmentObject private var store: CueStore
    @EnvironmentObject private var transfer: RunTransferController
    @State private var presentingNewRun = false
    @State private var presentingWidgetSettings = false
    @State private var presentingAccount = false
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
                TransferStatusSection()

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
                        .accessibilityIdentifier("web-history-link")
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
                        .accessibilityIdentifier("web-search-link")
                        .accessibilityHint("Webの検索画面を開きます")
                    }
                    Button("新しいリストを作る", systemImage: "plus") {
                        presentingNewRun = true
                    }
                    Button("Widget設定", systemImage: "square.grid.2x2") {
                        presentingWidgetSettings = true
                    }
                    Button(transfer.user == nil ? "ログイン" : "アカウント", systemImage: transfer.user == nil ? "person.crop.circle" : "person.crop.circle.fill") {
                        presentingAccount = true
                    }
                }
            }
            .sheet(isPresented: $presentingNewRun) {
                NewRunSheet { runID in path = [runID] }
            }
            .sheet(isPresented: $presentingWidgetSettings) {
                WidgetSettingsView(allowsDismiss: true)
            }
            .sheet(isPresented: $presentingAccount) {
                AccountSheet()
            }
            .onOpenURL { url in
                transfer.handle(url: url)
                guard url.scheme == "cuckoocue", url.host == "queue" else { return }
                let runID = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                    .queryItems?
                    .first(where: { $0.name == "run" })?
                    .value
                if let runID, store.snapshot.runs.contains(where: { $0.id == runID && $0.archivedAt == nil }) {
                    path = [runID]
                } else if runID == nil {
                    path = []
                }
            }
            .onChange(of: transfer.openedRunID) { _, runID in
                guard let runID else { return }
                path = [runID]
                transfer.consumeOpenedRunID()
            }
        }
    }
}

private struct TransferStatusSection: View {
    @EnvironmentObject private var transfer: RunTransferController

    @ViewBuilder
    var body: some View {
        switch transfer.transferState {
        case .idle:
            if let message = transfer.backgroundError {
                Section("Web同期を完了できませんでした") {
                    Text(message)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Button("もう一度試す") { transfer.retryPendingSyncs() }
                }
            }
        case .receiving:
            Section {
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Webのリストを受信しています…")
                }
                .accessibilityIdentifier("run-transfer-receiving")
            }
        case .needsSignIn:
            Section("Webから受け取る") {
                Text(transfer.configurationAvailable
                     ? "Webで使ったGoogleアカウントでログインすると、このリストを受け取れます。"
                     : "このビルドにはiOS用のFirebase設定が含まれていないため、リストを受信できません。")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Button("Googleでログイン") { Task { await transfer.signIn() } }
                    .disabled(!transfer.configurationAvailable)
            }
        case let .failed(_, message):
            Section("リストを受信できませんでした") {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if transfer.user == nil {
                    Button("Googleでログイン") { Task { await transfer.signIn() } }
                        .disabled(!transfer.configurationAvailable)
                } else {
                    Button("もう一度試す") { transfer.retryReceive() }
                }
            }
        }
    }
}

private struct AccountSheet: View {
    @EnvironmentObject private var transfer: RunTransferController
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                if let user = transfer.user {
                    Section("ログイン中") {
                        LabeledContent("アカウント", value: user.displayName ?? user.email ?? "Googleアカウント")
                        if let email = user.email, user.displayName != nil {
                            LabeledContent("メール", value: email)
                        }
                        Button("ログアウト", role: .destructive) { transfer.signOut() }
                    }
                } else {
                    Section {
                        Button("Googleでログイン") { Task { await transfer.signIn() } }
                            .disabled(!transfer.configurationAvailable)
                    } footer: {
                        Text(transfer.configurationAvailable
                             ? "Webと同じアカウントを使うと、リストを安全に送受信できます。"
                             : "このビルドにはiOS用のFirebase設定が含まれていません。")
                    }
                }
            }
            .navigationTitle("アカウント")
            .toolbar { Button("閉じる") { dismiss() } }
        }
    }
}

private struct RunRow: View {
    let run: CueRun
    let completed: Bool

    private var previewTasks: [CueTask] {
        Array(
            run.tasks
                .filter { completed || $0.completedAt == nil }
                .sorted { $0.sortOrder < $1.sortOrder }
                .prefix(3)
        )
    }

    private var remainingCount: Int {
        max(0, run.tasks.filter { completed || $0.completedAt == nil }.count - previewTasks.count)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(run.title)
                .font(.headline)
            ForEach(previewTasks) { task in
                HStack(spacing: 8) {
                    Circle()
                        .fill(priorityColor(task.effectivePriority()))
                        .frame(width: 8, height: 8)
                        .accessibilityHidden(true)
                    Text(task.title)
                        .font(.subheadline)
                        .foregroundStyle(completed ? Color.secondary : Color.primary)
                        .strikethrough(completed)
                        .lineLimit(1)
                }
            }
            if remainingCount > 0 {
                Text("ほか \(remainingCount)件")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
    }

    private func priorityColor(_ priority: CuePriority) -> Color {
        priority == .strong ? Color.cueTeal : priority == .medium ? Color.cueGreen : Color.secondary
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
            .accessibilityIdentifier("web-search-link")
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
