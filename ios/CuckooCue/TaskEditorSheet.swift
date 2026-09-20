import SwiftUI

struct TaskEditorSheet: View {
    @EnvironmentObject private var store: CueStore
    @Environment(\.dismiss) private var dismiss
    let runID: String
    let task: CueTask?
    @State private var title: String
    @State private var priority: CuePriority?
    @State private var hasAvailableFrom: Bool
    @State private var availableFrom: Date
    @State private var hasDueDate: Bool
    @State private var dueAt: Date

    init(runID: String, task: CueTask? = nil) {
        self.runID = runID
        self.task = task
        _title = State(initialValue: task?.title ?? "")
        _priority = State(initialValue: task?.userPriority ?? (task == nil ? .medium : nil))
        _hasAvailableFrom = State(initialValue: task?.availableFrom != nil)
        _availableFrom = State(initialValue: task?.availableFrom ?? .now)
        _hasDueDate = State(initialValue: task?.dueAt != nil)
        _dueAt = State(initialValue: task?.dueAt ?? .now)
    }

    private var selectedAvailableFrom: Date? { hasAvailableFrom ? availableFrom : nil }
    private var selectedDueAt: Date? { hasDueDate ? dueAt : nil }
    private var datesAreValid: Bool {
        guard let start = selectedAvailableFrom, let due = selectedDueAt else { return true }
        let calendar = Calendar.current
        return calendar.startOfDay(for: start) <= calendar.startOfDay(for: due)
    }
    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && datesAreValid
    }
    private var effectivePriority: CuePriority {
        priority ?? CueTask(runID: runID, title: title, dueAt: selectedDueAt, sortOrder: 0).effectivePriority()
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("内容") {
                    TextField("項目", text: $title)
                    Picker("優先度", selection: $priority) {
                        Text("期限から自動").tag(CuePriority?.none)
                        ForEach(CuePriority.allCases) { Text($0.label).tag(Optional($0)) }
                    }
                }
                Section("日付") {
                    Toggle("開始日を設定", isOn: $hasAvailableFrom)
                    if hasAvailableFrom {
                        DatePicker("開始日", selection: $availableFrom, displayedComponents: .date)
                    }
                    Toggle("期限を設定", isOn: $hasDueDate)
                    if hasDueDate {
                        DatePicker("期限", selection: $dueAt, displayedComponents: .date)
                    }
                    if !datesAreValid {
                        Text("開始日は期限以前の日付にしてください。")
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
                Section("ホーム画面") {
                    Text(widgetHint)
                        .foregroundStyle(effectivePriority == .quiet ? Color.secondary : Color.cueTeal)
                }
            }
            .navigationTitle(task == nil ? "新しい項目" : "項目を編集")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(task == nil ? "追加" : "保存") {
                        if let task {
                            guard store.updateTask(
                                taskID: task.id,
                                title: title,
                                priority: priority,
                                availableFrom: selectedAvailableFrom,
                                dueAt: selectedDueAt
                            ) else { return }
                        } else {
                            guard store.addTask(
                                runID: runID,
                                title: title,
                                priority: priority,
                                availableFrom: selectedAvailableFrom,
                                dueAt: selectedDueAt
                            ) != nil else { return }
                        }
                        dismiss()
                    }
                    .disabled(!canSave)
                }
            }
        }
    }

    private var widgetHint: String {
        switch effectivePriority {
        case .strong, .medium:
            return "このCueはホーム画面に出ます。"
        case .quiet:
            return "今はホーム画面に出ません。強・中にするか、近い期限を設定すると表示されます。"
        }
    }
}
