import Foundation

enum CuePriority: Int, Codable, CaseIterable, Identifiable {
    case strong = 0
    case medium = 1
    case quiet = 2

    var id: Int { rawValue }

    var label: String {
        switch self {
        case .strong: "強"
        case .medium: "中"
        case .quiet: "弱"
        }
    }
}

struct CueTask: Identifiable, Codable, Equatable {
    var id: String = UUID().uuidString
    var runID: String
    var title: String
    var userPriority: CuePriority?
    var availableFrom: Date?
    var dueAt: Date?
    var sortOrder: Int
    var completedAt: Date?
    var createdAt: Date = .now
    var updatedAt: Date = .now

    func effectivePriority(now: Date = .now, calendar: Calendar = .current) -> CuePriority {
        if let userPriority { return userPriority }
        guard let dueAt else { return .quiet }
        let today = calendar.startOfDay(for: now)
        let dueDay = calendar.startOfDay(for: dueAt)
        let days = calendar.dateComponents([.day], from: today, to: dueDay).day ?? 0
        if days <= 0 { return .strong }
        if days <= 3 { return .medium }
        return .quiet
    }
}

struct CueRun: Identifiable, Codable, Equatable {
    var id: String = UUID().uuidString
    var title: String
    var sortOrder: Int
    var archivedAt: Date?
    var completedAnchorAt: Date?
    var createdAt: Date = .now
    var updatedAt: Date = .now
    var tasks: [CueTask] = []
}

enum WidgetTheme: String, Codable, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }
    var label: String {
        switch self {
        case .system: "システム"
        case .light: "ライト"
        case .dark: "ダーク"
        }
    }
}

enum WidgetTextScale: String, Codable, CaseIterable, Identifiable {
    case compact
    case standard
    case large

    var id: String { rawValue }
    var label: String {
        switch self {
        case .compact: "コンパクト"
        case .standard: "標準"
        case .large: "大きめ"
        }
    }
}

struct CueSnapshot: Codable, Equatable {
    var runs: [CueRun] = []
    var selectedFilterTaskID: String?
    var footerOffset = 0
    var undoTaskID: String?
    var undoTitle: String?
    var widgetTheme: WidgetTheme = .system
    var widgetTextScale: WidgetTextScale = .standard
    var updatedAt: Date = .now

    var widgetCues: [CueTask] {
        runs
            .filter { $0.archivedAt == nil }
            .flatMap(\.tasks)
            .filter { task in
                task.completedAt == nil &&
                    !task.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
                    task.effectivePriority() != .quiet
            }
            .sorted {
                let left = $0.effectivePriority().rawValue
                let right = $1.effectivePriority().rawValue
                return left == right ? $0.sortOrder < $1.sortOrder : left < right
            }
    }

    func runTitle(for task: CueTask) -> String {
        runs.first(where: { $0.id == task.runID })?.title ?? "リスト"
    }

    static let demo: CueSnapshot = {
        let workID = "demo-work"
        let homeID = "demo-home"
        return CueSnapshot(runs: [
            CueRun(id: workID, title: "リリース準備", sortOrder: 0, tasks: [
                CueTask(id: "demo-1", runID: workID, title: "ストア掲載文を確認する", userPriority: .strong, sortOrder: 0),
                CueTask(id: "demo-2", runID: workID, title: "スクリーンショットを更新", userPriority: .medium, sortOrder: 1),
                CueTask(id: "demo-3", runID: workID, title: "テスト結果をチームに共有", userPriority: .medium, sortOrder: 2),
            ]),
            CueRun(id: homeID, title: "週末の用事", sortOrder: 1, tasks: [
                CueTask(id: "demo-4", runID: homeID, title: "図書館の本を返す", userPriority: .strong, sortOrder: 0),
                CueTask(id: "demo-5", runID: homeID, title: "コーヒー豆を買う", userPriority: .medium, sortOrder: 1),
                CueTask(id: "demo-6", runID: homeID, title: "植物に水をあげる", userPriority: .medium, sortOrder: 2),
            ]),
        ])
    }()
}

