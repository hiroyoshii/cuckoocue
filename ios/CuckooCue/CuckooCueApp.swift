import SwiftUI

@main
struct CuckooCueApp: App {
    @StateObject private var store = CueStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
        }
    }
}

private struct RootView: View {
    @EnvironmentObject private var store: CueStore

    var body: some View {
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("--screenshot-gallery") {
            ScreenshotGalleryView()
        } else if arguments.contains("--screenshot-detail") {
            RunDetailView(runID: store.snapshot.runs.first?.id ?? "missing")
        } else if arguments.contains("--screenshot-settings") {
            WidgetSettingsView()
        } else if arguments.contains("--screenshot-new-run") {
            NewRunSheet()
        } else if arguments.contains("--screenshot-new-task") {
            NewTaskSheet(runID: store.snapshot.runs.first?.id ?? "missing")
        } else {
            MainTabView()
        }
    }
}
