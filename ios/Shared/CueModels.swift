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
    var sourceTaskID: String?
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
    var sourceCuebookID: String?
    var targetAnchorDay: Date?
    var timeZone: String?
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
    // Retained for decoding snapshots written by the first WidgetKit implementation.
    var selectedFilterTaskID: String?
    var footerOffset = 0
    var widgetPageOffsets: [String: Int]?
    var undoTaskID: String?
    var undoTitle: String?
    var widgetTheme: WidgetTheme = .system
    var widgetTextScale: WidgetTextScale = .standard
    var updatedAt: Date = .now

    private enum CodingKeys: String, CodingKey {
        case runs
        case selectedFilterTaskID
        case footerOffset
        case widgetPageOffsets
        case undoTaskID
        case undoTitle
        case widgetTheme
        case widgetTextScale
        case updatedAt
    }

    init(
        runs: [CueRun] = [],
        selectedFilterTaskID: String? = nil,
        footerOffset: Int = 0,
        widgetPageOffsets: [String: Int]? = nil,
        undoTaskID: String? = nil,
        undoTitle: String? = nil,
        widgetTheme: WidgetTheme = .system,
        widgetTextScale: WidgetTextScale = .standard,
        updatedAt: Date = .now
    ) {
        self.runs = runs
        self.selectedFilterTaskID = selectedFilterTaskID
        self.footerOffset = footerOffset
        self.widgetPageOffsets = widgetPageOffsets
        self.undoTaskID = undoTaskID
        self.undoTitle = undoTitle
        self.widgetTheme = widgetTheme
        self.widgetTextScale = widgetTextScale
        self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        runs = try values.decodeIfPresent([CueRun].self, forKey: .runs) ?? []
        selectedFilterTaskID = try values.decodeIfPresent(String.self, forKey: .selectedFilterTaskID)
        footerOffset = try values.decodeIfPresent(Int.self, forKey: .footerOffset) ?? 0
        widgetPageOffsets = try values.decodeIfPresent([String: Int].self, forKey: .widgetPageOffsets)
        undoTaskID = try values.decodeIfPresent(String.self, forKey: .undoTaskID)
        undoTitle = try values.decodeIfPresent(String.self, forKey: .undoTitle)
        widgetTheme = try values.decodeIfPresent(WidgetTheme.self, forKey: .widgetTheme) ?? .system
        widgetTextScale = try values.decodeIfPresent(WidgetTextScale.self, forKey: .widgetTextScale) ?? .standard
        updatedAt = try values.decodeIfPresent(Date.self, forKey: .updatedAt) ?? .now
    }

    var widgetCues: [CueTask] {
        widgetCues(runID: nil, includeQuiet: false)
    }

    /// Mirrors Android's widget ordering: priority, due date, run order, task order, creation time.
    func widgetCues(runID: String?, includeQuiet: Bool, now: Date = .now) -> [CueTask] {
        let activeRuns = runs.filter { run in
            run.archivedAt == nil && (runID == nil || run.id == runID)
        }
        let runOrders = Dictionary(uniqueKeysWithValues: activeRuns.map { ($0.id, $0.sortOrder) })

        return activeRuns
            .flatMap(\.tasks)
            .filter { task in
                task.completedAt == nil &&
                    !task.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
                    (includeQuiet || task.effectivePriority(now: now) != .quiet)
            }
            .sorted { left, right in
                let leftPriority = left.effectivePriority(now: now).rawValue
                let rightPriority = right.effectivePriority(now: now).rawValue
                if leftPriority != rightPriority { return leftPriority < rightPriority }

                switch (left.dueAt, right.dueAt) {
                case let (leftDue?, rightDue?) where leftDue != rightDue:
                    return leftDue < rightDue
                case (_?, nil):
                    return true
                case (nil, _?):
                    return false
                default:
                    break
                }

                let leftRunOrder = runOrders[left.runID] ?? .max
                let rightRunOrder = runOrders[right.runID] ?? .max
                if leftRunOrder != rightRunOrder { return leftRunOrder < rightRunOrder }
                if left.sortOrder != right.sortOrder { return left.sortOrder < right.sortOrder }
                return left.createdAt < right.createdAt
            }
    }

    func pageOffset(for scopeID: String) -> Int {
        widgetPageOffsets?[scopeID] ?? 0
    }

    func pendingTaskCount(runID: String?) -> Int {
        runs
            .filter { $0.archivedAt == nil && (runID == nil || $0.id == runID) }
            .flatMap(\.tasks)
            .filter { $0.completedAt == nil && !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .count
    }

    func configuredRunTitle(runID: String?) -> String {
        guard let runID else { return "すべて" }
        return runs.first(where: { $0.id == runID })?.title ?? "リスト"
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

    static let multiRunDemo: CueSnapshot = {
        let morningID = "demo-morning"
        let departureID = "demo-departure"
        let cityOfficeID = "demo-city-office"
        let clinicID = "demo-clinic"
        let homeCareID = "demo-home-care"
        let backupID = "demo-backup"
        return CueSnapshot(runs: [
            CueRun(id: morningID, title: "朝の支度", sortOrder: 0, tasks: [
                CueTask(id: "multi-1", runID: morningID, title: "水筒に水を入れる", userPriority: .strong, sortOrder: 0),
                CueTask(id: "multi-2", runID: morningID, title: "明日の服を玄関近くに置く", userPriority: .medium, sortOrder: 1),
            ]),
            CueRun(id: departureID, title: "出発前", sortOrder: 1, tasks: [
                CueTask(id: "multi-3", runID: departureID, title: "戸締まりと火元を確認する", userPriority: .strong, sortOrder: 0),
                CueTask(id: "multi-4", runID: departureID, title: "移動中に読む案内を保存する", userPriority: .medium, sortOrder: 1),
            ]),
            CueRun(id: cityOfficeID, title: "役所まわり", sortOrder: 2, tasks: [
                CueTask(id: "multi-5", runID: cityOfficeID, title: "本人確認書類をかばんに入れる", userPriority: .strong, sortOrder: 0),
                CueTask(id: "multi-6", runID: cityOfficeID, title: "転出届の受付時間を確認する", userPriority: .medium, sortOrder: 1),
            ]),
            CueRun(id: clinicID, title: "病院の準備", sortOrder: 3, tasks: [
                CueTask(id: "multi-7", runID: clinicID, title: "診察券と紹介状をまとめる", userPriority: .strong, sortOrder: 0),
                CueTask(id: "multi-8", runID: clinicID, title: "薬の残数をメモする", userPriority: .medium, sortOrder: 1),
            ]),
            CueRun(id: homeCareID, title: "家のメンテ", sortOrder: 4, tasks: [
                CueTask(id: "multi-9", runID: homeCareID, title: "換気フィルターの型番を確認する", userPriority: .strong, sortOrder: 0),
                CueTask(id: "multi-10", runID: homeCareID, title: "粗大ごみの回収日を控える", userPriority: .medium, sortOrder: 1),
            ]),
            CueRun(id: backupID, title: "バックアップ", sortOrder: 5, tasks: [
                CueTask(id: "multi-11", runID: backupID, title: "復旧コードの保管場所を確認する", userPriority: .strong, sortOrder: 0),
                CueTask(id: "multi-12", runID: backupID, title: "外付けドライブにログインする", userPriority: .medium, sortOrder: 1),
            ]),
        ])
    }()
}
