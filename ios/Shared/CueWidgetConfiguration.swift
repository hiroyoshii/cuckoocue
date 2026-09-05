import AppIntents

struct CueRunEntity: AppEntity, Identifiable {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "リスト")
    static var defaultQuery = CueRunEntityQuery()

    let id: String
    let title: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)")
    }
}

struct CueRunEntityQuery: EntityQuery {
    func entities(for identifiers: [CueRunEntity.ID]) async throws -> [CueRunEntity] {
        availableRuns().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [CueRunEntity] {
        availableRuns()
    }

    private func availableRuns() -> [CueRunEntity] {
        CueStorage.load().runs
            .filter { $0.archivedAt == nil }
            .sorted { $0.sortOrder < $1.sortOrder }
            .map { CueRunEntity(id: $0.id, title: $0.title) }
    }
}

struct CueWidgetConfigurationIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "表示する項目"
    static var description = IntentDescription("Widgetに表示するリストと優先度を選びます。")

    @Parameter(title: "リスト")
    var run: CueRunEntity?

    @Parameter(title: "弱い優先度も表示", default: false)
    var includeQuiet: Bool

    init() {
        run = nil
        includeQuiet = false
    }
}
