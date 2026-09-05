import AppIntents
import SwiftUI
import WidgetKit

struct CueTimelineEntry: TimelineEntry {
    let date: Date
    let snapshot: CueSnapshot
    let configuredRunID: String?
    let includeQuiet: Bool
    let relevance: TimelineEntryRelevance?
}

struct CueTimelineProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> CueTimelineEntry {
        makeEntry(snapshot: .demo, configuration: CueWidgetConfigurationIntent())
    }

    func snapshot(
        for configuration: CueWidgetConfigurationIntent,
        in context: Context
    ) async -> CueTimelineEntry {
        makeEntry(snapshot: context.isPreview ? .demo : widgetSnapshot(), configuration: configuration)
    }

    func timeline(
        for configuration: CueWidgetConfigurationIntent,
        in context: Context
    ) async -> Timeline<CueTimelineEntry> {
        let snapshot = widgetSnapshot()
        let entry = makeEntry(snapshot: snapshot, configuration: configuration)
        let calendar = Calendar.current
        let nextMidnight = calendar.nextDate(
            after: .now,
            matching: DateComponents(hour: 0, minute: 1),
            matchingPolicy: .nextTime
        ) ?? .now.addingTimeInterval(86_400)
        return Timeline(entries: [entry], policy: .after(nextMidnight))
    }

    private func makeEntry(
        snapshot: CueSnapshot,
        configuration: CueWidgetConfigurationIntent
    ) -> CueTimelineEntry {
        let runID = configuration.run?.id
        let cues = snapshot.widgetCues(runID: runID, includeQuiet: configuration.includeQuiet)
        let strongestPriority = cues.first?.effectivePriority().rawValue ?? CuePriority.quiet.rawValue
        let score = cues.isEmpty ? 0 : Float(CuePriority.quiet.rawValue - strongestPriority + 1)
        return CueTimelineEntry(
            date: .now,
            snapshot: snapshot,
            configuredRunID: runID,
            includeQuiet: configuration.includeQuiet,
            relevance: TimelineEntryRelevance(score: score, duration: 3_600)
        )
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
        CueWidgetCard(
            snapshot: entry.snapshot,
            family: family,
            configuredRunID: entry.configuredRunID,
            includeQuiet: entry.includeQuiet
        )
    }
}

@main
struct CuckooCueWidgetBundle: WidgetBundle {
    var body: some Widget {
        CuckooCueWidget()
        if #available(iOSApplicationExtension 18.0, *) {
            CuckooCueOpenControl()
        }
    }
}

private struct CuckooCueWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: CueWidgetConstants.kind,
            intent: CueWidgetConfigurationIntent.self,
            provider: CueTimelineProvider()
        ) { entry in
            CuckooCueWidgetEntryView(entry: entry)
                .containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName("Cuckoo Cue")
        .description("Androidと同じ優先項目を、ホーム画面から確認・完了できます。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
        .contentMarginsDisabled()
    }
}

@available(iOSApplicationExtension 18.0, *)
private struct CuckooCueOpenControl: ControlWidget {
    static let kind = "app.cuckoocue.open-queue"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenCueQueueIntent()) {
                Label("Cuckoo Cueを開く", systemImage: "checklist")
            }
        }
        .displayName("Cuckoo Cue")
        .description("優先項目の一覧を開きます。")
    }
}
