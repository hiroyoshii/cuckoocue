import SwiftUI
import WidgetKit

struct CueWidgetCard: View {
    let snapshot: CueSnapshot
    let family: WidgetFamily
    var interactive = true
    var configuredRunID: String?
    var includeQuiet = false

    @Environment(\.colorScheme) private var systemColorScheme

    private var palette: CuePalette {
        let dark = switch snapshot.widgetTheme {
        case .system: systemColorScheme == .dark
        case .light: false
        case .dark: true
        }
        return CuePalette(dark: dark)
    }

    private var visibleCount: Int {
        switch family {
        case .accessoryRectangular: 1
        case .systemSmall: 3
        case .systemMedium: 3
        default: 7
        }
    }

    private var allCues: [CueTask] {
        snapshot.widgetCues(runID: configuredRunID, includeQuiet: includeQuiet)
    }

    private var undoTask: CueTask? {
        guard let undoTaskID = snapshot.undoTaskID else { return nil }
        return snapshot.runs
            .filter { configuredRunID == nil || $0.id == configuredRunID }
            .flatMap(\.tasks)
            .first { $0.id == undoTaskID }
    }

    private var pageSize: Int {
        family == .systemSmall ? visibleCount : max(visibleCount - (undoTask == nil ? 0 : 1), 1)
    }

    private var scopeID: String {
        let run = configuredRunID ?? "all"
        let size = switch family {
        case .systemSmall: "small"
        case .systemMedium: "medium"
        case .systemLarge: "large"
        case .accessoryRectangular: "lock"
        default: "other"
        }
        return "\(run)-\(includeQuiet ? "all-priorities" : "focused")-\(size)"
    }

    private var pageIndex: Int {
        guard family != .systemSmall, !allCues.isEmpty else { return 0 }
        let pageCount = max(Int(ceil(Double(allCues.count) / Double(pageSize))), 1)
        let storedOffset = snapshot.widgetPageOffsets?[scopeID] ?? snapshot.footerOffset
        return max(storedOffset / pageSize, 0) % pageCount
    }

    private var pageStart: Int { pageIndex * pageSize }

    private var cues: [CueTask] {
        let count = family == .systemSmall && undoTask != nil ? visibleCount - 1 : pageSize
        return Array(allCues.dropFirst(pageStart).prefix(max(count, 0)))
    }

    var body: some View {
        Group {
            if family == .accessoryRectangular {
                accessoryBody
            } else {
                systemFamilyBody
            }
        }
        .environment(\.colorScheme, palette.isDark ? .dark : .light)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Cuckoo Cue ウィジェット")
        .widgetURL(openURL)
    }

    private var systemFamilyBody: some View {
        VStack(spacing: 0) {
            if cues.isEmpty && undoTask == nil {
                emptyState
            } else {
                VStack(spacing: 1) {
                    ForEach(cues) { task in cueRow(task) }
                    if family == .systemSmall, let undoTask {
                        inlineUndoRow(undoTask)
                    }
                    Spacer(minLength: 0)
                }
            }

            if family == .systemSmall {
                smallStatus.frame(height: 16)
            } else {
                footer.frame(height: 30)
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 7)
        .padding(.bottom, 5)
        .background(palette.surface)
    }

    private var accessoryBody: some View {
        Group {
            if let task = allCues.first {
                VStack(alignment: .leading, spacing: 2) {
                    Text(snapshot.configuredRunTitle(runID: configuredRunID))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                    cueRow(task, compactAccessory: true)
                }
            } else {
                Text(emptyTitle).font(.caption.weight(.semibold))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var emptyState: some View {
        VStack(spacing: 3) {
            Spacer()
            Text(emptyTitle)
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundStyle(palette.ink)
            Text(emptyDetail)
                .font(.system(size: 10, design: .rounded))
                .foregroundStyle(palette.muted)
                .lineLimit(1)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
    }

    private var emptyTitle: String {
        if snapshot.pendingTaskCount(runID: configuredRunID) > 0 { return "優先項目はありません" }
        let scopedRuns = snapshot.runs.filter { $0.archivedAt == nil && (configuredRunID == nil || $0.id == configuredRunID) }
        if scopedRuns.flatMap(\.tasks).isEmpty { return "項目がありません" }
        return "すべて完了しました"
    }

    private var emptyDetail: String {
        if snapshot.pendingTaskCount(runID: configuredRunID) > 0 { return "設定で弱い優先度も表示できます" }
        return "アプリで項目を追加できます"
    }

    @ViewBuilder
    private func cueRow(_ task: CueTask, compactAccessory: Bool = false) -> some View {
        let label = HStack(spacing: compactAccessory ? 4 : 6) {
            Circle()
                .fill(palette.priority(task.effectivePriority()))
                .frame(width: prioritySize(task), height: prioritySize(task))
                .frame(width: compactAccessory ? 12 : 15)
            Text(task.title)
                .font(.system(size: compactAccessory ? 11 : titleSize, weight: .semibold, design: .rounded))
                .lineLimit(family == .systemSmall || compactAccessory ? 1 : 2)
                .minimumScaleFactor(0.78)
                .foregroundStyle(palette.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
            if !compactAccessory {
                RoundedRectangle(cornerRadius: 2)
                    .fill(palette.group(task.runID))
                    .frame(width: 3, height: 18)
            }
        }
        .contentShape(Rectangle())
        .frame(maxWidth: .infinity, minHeight: compactAccessory ? 30 : rowHeight, alignment: .leading)
        .padding(.horizontal, compactAccessory ? 1 : 4)

        if interactive {
            Toggle(isOn: false, intent: CompleteCueIntent(taskID: task.id)) { label }
                .toggleStyle(CueCompletionToggleStyle(
                    accent: palette.teal,
                    muted: palette.muted,
                    highlight: palette.highlight
                ))
                .accessibilityLabel("\(task.title)を完了")
                .invalidatableContent()
        } else {
            HStack(spacing: 6) {
                Image(systemName: "square")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(palette.muted)
                label
            }
            .accessibilityLabel("\(task.title)、未完了")
        }
    }

    @ViewBuilder
    private func inlineUndoRow(_ task: CueTask) -> some View {
        let label = HStack(spacing: 6) {
            Image(systemName: "checkmark.square.fill").foregroundStyle(palette.teal)
            Text(task.title).lineLimit(1).foregroundStyle(palette.muted)
            Spacer(minLength: 2)
            Text("戻す").fontWeight(.bold).foregroundStyle(palette.teal)
        }
        .font(.system(size: 11, design: .rounded))
        .frame(maxWidth: .infinity, minHeight: rowHeight)
        .contentShape(Rectangle())

        if interactive {
            Button(intent: UndoCueIntent()) { label }
                .buttonStyle(.plain)
                .accessibilityLabel("\(task.title)の完了を戻す")
        } else {
            label
        }
    }

    private var smallStatus: some View {
        HStack(spacing: 4) {
            Text(snapshot.configuredRunTitle(runID: configuredRunID)).lineLimit(1)
            Spacer(minLength: 2)
            Text("\(allCues.count)件")
        }
        .font(.system(size: 9, weight: .semibold, design: .rounded))
        .foregroundStyle(palette.muted)
    }

    private var footer: some View {
        HStack(spacing: 7) {
            if let undoTask {
                if interactive {
                    Button(intent: UndoCueIntent()) { undoLabel(undoTask.title) }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(undoTask.title)の完了を戻す")
                } else {
                    undoLabel(undoTask.title)
                }
            } else {
                Text(snapshot.configuredRunTitle(runID: configuredRunID))
                    .fontWeight(.semibold)
                    .lineLimit(1)
                if !allCues.isEmpty {
                    Text(pageDescription).monospacedDigit()
                }
            }

            Spacer(minLength: 2)

            if allCues.count > pageSize {
                if interactive {
                    Button(intent: AdvanceCuePageIntent(scopeID: scopeID, pageSize: pageSize)) { nextLabel }
                        .buttonStyle(.plain)
                        .accessibilityLabel("次の\(pageSize)件を表示")
                } else {
                    nextLabel
                }
            }

            if interactive {
                Link(destination: openURL) { openLabel }
                    .accessibilityLabel("アプリで一覧を開く")
            } else {
                openLabel
            }
        }
        .font(.system(size: 10, design: .rounded))
        .foregroundStyle(palette.muted)
    }

    private var pageDescription: String {
        let first = min(pageStart + 1, allCues.count)
        let last = min(pageStart + cues.count, allCues.count)
        return "\(first)–\(last) / \(allCues.count)"
    }

    private func undoLabel(_ title: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: "arrow.uturn.backward")
            Text("戻す").fontWeight(.bold)
            Text(title).lineLimit(1)
        }
        .font(.system(size: 11, design: .rounded))
        .foregroundStyle(palette.teal)
    }

    private var nextLabel: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 14, weight: .bold))
            .frame(width: 30, height: 28)
            .contentShape(Rectangle())
            .foregroundStyle(palette.ink)
    }

    private var openLabel: some View {
        Image(systemName: "arrow.up.right")
            .font(.system(size: 11, weight: .bold))
            .frame(width: 26, height: 28)
            .contentShape(Rectangle())
            .foregroundStyle(palette.muted)
    }

    private var openURL: URL {
        var components = URLComponents()
        components.scheme = "cuckoocue"
        components.host = "queue"
        if let configuredRunID {
            components.queryItems = [URLQueryItem(name: "run", value: configuredRunID)]
        }
        return components.url ?? URL(string: "cuckoocue://queue")!
    }

    private var titleSize: CGFloat {
        switch snapshot.widgetTextScale {
        case .compact: 11
        case .standard: 12
        case .large: 13
        }
    }

    private var rowHeight: CGFloat {
        switch snapshot.widgetTextScale {
        case .compact: family == .systemSmall ? 43 : 40
        case .standard: family == .systemSmall ? 44 : 42
        case .large: family == .systemSmall ? 46 : 44
        }
    }

    private func prioritySize(_ task: CueTask) -> CGFloat {
        switch task.effectivePriority() {
        case .strong: 13
        case .medium: 9
        case .quiet: 5
        }
    }
}

private struct CueCompletionToggleStyle: ToggleStyle {
    let accent: Color
    let muted: Color
    let highlight: Color

    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: configuration.isOn ? "checkmark.square.fill" : "square")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(configuration.isOn ? accent : muted)
                configuration.label
            }
            .padding(.horizontal, 4)
            .background(configuration.isOn ? highlight : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private struct CuePalette {
    let isDark: Bool
    let ink: Color
    let muted: Color
    let surface: Color
    let highlight: Color
    let teal = Color(red: 0.31, green: 0.56, blue: 0.53)
    let green = Color(red: 0.44, green: 0.56, blue: 0.36)
    let gold = Color(red: 0.79, green: 0.58, blue: 0.25)

    init(dark: Bool) {
        isDark = dark
        ink = dark ? Color(red: 0.92, green: 0.95, blue: 0.93) : Color(red: 0.09, green: 0.13, blue: 0.15)
        muted = dark ? Color(red: 0.62, green: 0.67, blue: 0.65) : Color(red: 0.39, green: 0.44, blue: 0.45)
        surface = dark ? Color(red: 0.06, green: 0.09, blue: 0.09) : Color(red: 0.97, green: 0.97, blue: 0.95)
        highlight = dark ? Color(red: 0.12, green: 0.20, blue: 0.18) : Color(red: 0.91, green: 0.96, blue: 0.94)
    }

    func priority(_ priority: CuePriority) -> Color {
        switch priority {
        case .strong: teal
        case .medium: green.opacity(0.82)
        case .quiet: muted.opacity(0.5)
        }
    }

    func group(_ key: String) -> Color {
        switch key.unicodeScalars.reduce(0, { $0 + Int($1.value) }) % 3 {
        case 1: green
        case 2: gold
        default: teal
        }
    }
}
