import SwiftUI
import WidgetKit

struct WidgetSettingsView: View {
    @EnvironmentObject private var store: CueStore
    @Environment(\.dismiss) private var dismiss
    var allowsDismiss = false

    var body: some View {
        NavigationStack {
            Form {
                Section("プレビュー") {
                    CueWidgetCard(
                        snapshot: store.snapshot,
                        family: .systemMedium,
                        interactive: false
                    )
                    .frame(maxWidth: .infinity)
                    .aspectRatio(364 / 170, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .accessibilityIdentifier("widget-settings-preview")
                }
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
