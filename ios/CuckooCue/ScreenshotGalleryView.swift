import SwiftUI
import WidgetKit

struct ScreenshotGalleryView: View {
    @EnvironmentObject private var store: CueStore
    @State private var family: WidgetFamily

    init() {
        let arguments = ProcessInfo.processInfo.arguments
        let selected: WidgetFamily = if arguments.contains("small") {
            .systemSmall
        } else if arguments.contains("large") {
            .systemLarge
        } else {
            .systemMedium
        }
        _family = State(initialValue: selected)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color(uiColor: .systemGroupedBackground).ignoresSafeArea()
                VStack(spacing: 28) {
                    Picker("ウィジェットサイズ", selection: $family) {
                        Text("Small").tag(WidgetFamily.systemSmall)
                        Text("Medium").tag(WidgetFamily.systemMedium)
                        Text("Large").tag(WidgetFamily.systemLarge)
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("widget-family-picker")

                    CueWidgetCard(snapshot: store.snapshot, family: family, interactive: false)
                        .frame(width: widgetSize.width, height: widgetSize.height)
                        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                        .shadow(color: .black.opacity(0.12), radius: 18, y: 8)
                        .accessibilityIdentifier("widget-preview")
                    Spacer()
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
            }
            .navigationTitle("ウィジェットプレビュー")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var widgetSize: CGSize {
        switch family {
        case .systemSmall: CGSize(width: 170, height: 170)
        case .systemMedium: CGSize(width: 364, height: 170)
        default: CGSize(width: 364, height: 382)
        }
    }
}

