import SwiftUI
import WidgetKit

struct CueWidgetCard: View {
    let snapshot: CueSnapshot
    let family: WidgetFamily
    var interactive = true

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
        case .systemSmall: 2
        case .systemMedium: 3
        default: 7
        }
    }

    private var cues: [CueTask] {
        let all = snapshot.widgetCues
        let filtered = snapshot.selectedFilterTaskID.map { id in all.filter { $0.id == id } } ?? all
        guard !filtered.isEmpty else { return [] }
        let offset = snapshot.footerOffset % filtered.count
        return Array((Array(filtered[offset...]) + Array(filtered[..<offset])).prefix(visibleCount))
    }

    var body: some View {
        VStack(spacing: 0) {
            if cues.isEmpty {
                emptyState
            } else {
                VStack(spacing: 1) {
                    ForEach(cues) { task in cueRow(task) }
                    Spacer(minLength: 0)
                }
            }

            if family != .systemSmall {
                footer
                    .frame(height: 30)
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 8)
        .padding(.bottom, family == .systemSmall ? 8 : 9)
        .background(palette.surface)
        .environment(\.colorScheme, palette.isDark ? .dark : .light)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Cuckoo Cue ウィジェット")
    }

    private var emptyState: some View {
        VStack(spacing: 3) {
            Spacer()
            Text("Cuckoo Cue")
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundStyle(palette.ink)
            Text("アプリで項目を作る")
                .font(.caption)
                .foregroundStyle(palette.muted)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func cueRow(_ task: CueTask) -> some View {
        let label = HStack(spacing: family == .systemSmall ? 5 : 7) {
            Image(systemName: "square")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(palette.muted)
            Circle()
                .fill(palette.priority(task.effectivePriority()))
                .frame(width: prioritySize(task), height: prioritySize(task))
                .frame(width: 15)
            Text(task.title)
                .font(.system(size: titleSize, weight: .semibold, design: .rounded))
                .lineLimit(family == .systemSmall ? 2 : 1)
                .minimumScaleFactor(0.78)
                .foregroundStyle(palette.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
            RoundedRectangle(cornerRadius: 2)
                .fill(palette.group(task.runID))
                .frame(width: 3, height: 18)
        }
        .contentShape(Rectangle())
        .frame(maxWidth: .infinity, minHeight: rowHeight, alignment: .leading)
        .padding(.horizontal, 5)

        if interactive {
            Button(intent: CompleteCueIntent(taskID: task.id)) { label }
                .buttonStyle(.plain)
                .accessibilityLabel("\(task.title)を完了")
                .invalidatableContent()
        } else {
            label.accessibilityLabel("\(task.title)、未完了")
        }
    }

    private var footer: some View {
        HStack(spacing: 8) {
            if snapshot.undoTaskID != nil, let title = snapshot.undoTitle {
                if interactive {
                    Button(intent: UndoCueIntent()) { undoLabel(title) }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(title)の完了を戻す")
                } else {
                    undoLabel(title)
                }
            } else {
                let tips = Array(snapshot.widgetCues.prefix(family == .systemMedium ? 3 : 5))
                ForEach(tips) { task in
                    if interactive {
                        Button(intent: ToggleCueFilterIntent(taskID: task.id)) {
                            footerTip(task)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(task.title)で絞り込む")
                    } else {
                        footerTip(task)
                    }
                }
            }
            Spacer(minLength: 0)
            if interactive {
                Button(intent: AdvanceCuePageIntent()) { nextLabel }
                    .buttonStyle(.plain)
                    .accessibilityLabel("次の項目を表示")
            } else {
                nextLabel
            }
        }
        .foregroundStyle(palette.muted)
    }

    private func undoLabel(_ title: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: "arrow.uturn.backward")
            Text("戻す")
                .fontWeight(.bold)
            Text(title).lineLimit(1)
        }
        .font(.system(size: 11, design: .rounded))
        .foregroundStyle(palette.teal)
    }

    private func footerTip(_ task: CueTask) -> some View {
        Text(task.title)
            .font(.system(size: 10, weight: snapshot.selectedFilterTaskID == task.id ? .bold : .medium, design: .rounded))
            .lineLimit(1)
            .frame(maxWidth: family == .systemMedium ? 66 : 92, alignment: .leading)
            .overlay(alignment: .bottomLeading) {
                Capsule()
                    .fill(palette.group(task.runID).opacity(0.38))
                    .frame(width: 13, height: 5)
                    .offset(y: 1)
            }
    }

    private var nextLabel: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 15, weight: .bold))
            .frame(width: 26, height: 26)
            .contentShape(Rectangle())
            .foregroundStyle(palette.ink)
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
        case .compact: family == .systemSmall ? 43 : 27
        case .standard: family == .systemSmall ? 46 : 30
        case .large: family == .systemSmall ? 49 : 34
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

private struct CuePalette {
    let isDark: Bool
    let ink: Color
    let muted: Color
    let surface: Color
    let teal = Color(red: 0.31, green: 0.56, blue: 0.53)
    let green = Color(red: 0.44, green: 0.56, blue: 0.36)
    let gold = Color(red: 0.79, green: 0.58, blue: 0.25)

    init(dark: Bool) {
        isDark = dark
        ink = dark ? Color(red: 0.92, green: 0.95, blue: 0.93) : Color(red: 0.09, green: 0.13, blue: 0.15)
        muted = dark ? Color(red: 0.62, green: 0.67, blue: 0.65) : Color(red: 0.39, green: 0.44, blue: 0.45)
        surface = dark ? Color(red: 0.06, green: 0.09, blue: 0.09) : Color(red: 0.97, green: 0.97, blue: 0.95)
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

