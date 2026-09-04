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
    var body: some View {
        if ProcessInfo.processInfo.arguments.contains("--screenshot-gallery") {
            ScreenshotGalleryView()
        } else {
            MainTabView()
        }
    }
}

