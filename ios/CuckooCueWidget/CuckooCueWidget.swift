import SwiftUI
import WidgetKit

struct CueTimelineEntry: TimelineEntry {
    let date: Date
    let snapshot: CueSnapshot
}

struct CueTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> CueTimelineEntry {
        CueTimelineEntry(date: .now, snapshot: .demo)
    }

    func getSnapshot(in context: Context, completion: @escaping (CueTimelineEntry) -> Void) {
        completion(CueTimelineEntry(date: .now, snapshot: context.isPreview ? .demo : widgetSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CueTimelineEntry>) -> Void) {
        let snapshot = widgetSnapshot()
        let calendar = Calendar.current
        let nextMidnight = calendar.nextDate(
            after: .now,
            matching: DateComponents(hour: 0, minute: 1),
            matchingPolicy: .nextTime
        ) ?? .now.addingTimeInterval(86_400)
        completion(Timeline(entries: [CueTimelineEntry(date: .now, snapshot: snapshot)], policy: .after(nextMidnight)))
    }

    private func widgetSnapshot() -> CueSnapshot {
#if SCREENSHOT_TESTING
        .demo
#else
        CueStorage.load()
#endif
    }
}

struct CuckooCueWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CueTimelineEntry

    var body: some View {
        CueWidgetCard(snapshot: entry.snapshot, family: family)
    }
}

@main
struct CuckooCueWidgetBundle: WidgetBundle {
    var body: some Widget { CuckooCueWidget() }
}

private struct CuckooCueWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: CueWidgetConstants.kind, provider: CueTimelineProvider()) { entry in
            CuckooCueWidgetEntryView(entry: entry)
                .containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName("Cuckoo Cue")
        .description("いま行動できる項目をホーム画面から完了できます。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}
