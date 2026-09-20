import SwiftUI

@main
@MainActor
struct CuckooCueApp: App {
    @StateObject private var store: CueStore
    @StateObject private var transfer: RunTransferController
    @Environment(\.scenePhase) private var scenePhase

    init() {
        let store = CueStore()
        _store = StateObject(wrappedValue: store)
        _transfer = StateObject(wrappedValue: RunTransferController(store: store))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(transfer)
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { transfer.applicationBecameActive() }
                }
        }
    }
}

private struct RootView: View {
    @EnvironmentObject private var store: CueStore

    var body: some View {
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("--screenshot-gallery") {
            WidgetScreenshotHarnessView()
        } else if arguments.contains("--screenshot-detail") {
            NavigationStack {
                RunDetailView(runID: store.snapshot.runs.first?.id ?? "missing")
            }
        } else if arguments.contains("--screenshot-settings") {
            WidgetSettingsView()
        } else if arguments.contains("--screenshot-new-run") {
            NewRunSheet()
        } else if arguments.contains("--screenshot-new-task") {
            NavigationStack {
                RunDetailView(runID: store.snapshot.runs.first?.id ?? "missing")
            }
        } else if arguments.contains("--screenshot-edit-task"),
                  let run = store.snapshot.runs.first,
                  let task = run.tasks.first {
            NavigationStack {
                RunDetailView(runID: run.id, initiallyExpandedTaskID: task.id)
            }
        } else {
            MainTabView()
        }
    }
}
