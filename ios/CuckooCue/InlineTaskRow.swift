import SwiftUI

struct NewTaskComposer: View {
    @Binding var title: String
    let onAdd: () -> Void
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "plus.circle.fill")
                .foregroundStyle(Color.cueTeal)
                .accessibilityHidden(true)
            TextField("新しい項目", text: $title)
                .focused($focused)
                .submitLabel(.done)
                .onSubmit(submit)
                .accessibilityIdentifier("new-task-title")
            if !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Button("追加", action: submit)
                    .font(.subheadline.weight(.semibold))
            }
        }
        .padding(.vertical, 3)
    }

    private func submit() {
        guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        onAdd()
        focused = true
    }
}

struct InlineTaskRow: View {
    let task: CueTask
    @Binding var isExpanded: Bool
    let onToggleCompletion: () -> Void
    let onSave: (String, CuePriority?, Date?, Date?) -> Bool
    let onDelete: () -> Void

    @State private var editingTitle = false
    @State private var title: String
    @State private var priority: CuePriority?
    @State private var hasAvailableFrom: Bool
    @State private var availableFrom: Date
    @State private var hasDueDate: Bool
    @State private var dueAt: Date
    @FocusState private var titleFocused: Bool

    init(
        task: CueTask,
        isExpanded: Binding<Bool>,
        onToggleCompletion: @escaping () -> Void,
        onSave: @escaping (String, CuePriority?, Date?, Date?) -> Bool,
        onDelete: @escaping () -> Void
    ) {
        self.task = task
        _isExpanded = isExpanded
        self.onToggleCompletion = onToggleCompletion
        self.onSave = onSave
        self.onDelete = onDelete
        _title = State(initialValue: task.title)
        _priority = State(initialValue: task.userPriority)
        _hasAvailableFrom = State(initialValue: task.availableFrom != nil)
        _availableFrom = State(initialValue: task.availableFrom ?? .now)
        _hasDueDate = State(initialValue: task.dueAt != nil)
        _dueAt = State(initialValue: task.dueAt ?? .now)
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

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                Button(action: onToggleCompletion) {
                    Image(systemName: task.completedAt == nil ? "square" : "checkmark.square.fill")
                        .font(.title3)
                        .foregroundStyle(task.completedAt == nil ? Color.secondary : Color.cueTeal)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(task.completedAt == nil ? "\(task.title)を完了" : "\(task.title)の完了を取り消す")

                Circle()
                    .fill(priorityColor(effectivePriority))
                    .frame(width: 10, height: 10)
                    .accessibilityHidden(true)

                if editingTitle {
                    TextField("項目", text: $title)
                        .focused($titleFocused)
                        .submitLabel(.done)
                        .onSubmit(saveAndFinishTitle)
                        .accessibilityIdentifier("task-title-editor-\(task.id)")
                } else {
                    Button {
                        editingTitle = true
                        DispatchQueue.main.async { titleFocused = true }
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(task.title)
                                .foregroundStyle(task.completedAt == nil ? Color.primary : .secondary)
                                .strikethrough(task.completedAt != nil)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if !metadata.isEmpty {
                                Text(metadata)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(task.title)を編集")
                }

                Button {
                    withAnimation { isExpanded.toggle() }
                } label: {
                    Image(systemName: isExpanded ? "chevron.up.circle.fill" : "ellipsis.circle")
                        .font(.title3)
                        .foregroundStyle(Color.cueTeal)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(isExpanded ? "\(task.title)の詳細を閉じる" : "\(task.title)の日付と優先度を編集")
            }

            if isExpanded {
                VStack(spacing: 8) {
                    Picker("優先度", selection: $priority) {
                        Text("期限から自動").tag(CuePriority?.none)
                        ForEach(CuePriority.allCases) { value in
                            Text(value.label).tag(Optional(value))
                        }
                    }
                    .pickerStyle(.menu)

                    Toggle("開始日を設定", isOn: $hasAvailableFrom)
                    if hasAvailableFrom {
                        DatePicker("開始日", selection: $availableFrom, displayedComponents: .date)
                            .datePickerStyle(.compact)
                    }

                    Toggle("期限を設定", isOn: $hasDueDate)
                    if hasDueDate {
                        DatePicker("期限", selection: $dueAt, displayedComponents: .date)
                            .datePickerStyle(.compact)
                    }

                    if !datesAreValid {
                        Text("開始日は期限以前の日付にしてください。")
                            .font(.caption)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    HStack {
                        Button("削除", role: .destructive, action: onDelete)
                        Spacer()
                        Button("閉じる") { withAnimation { isExpanded = false } }
                        Button("保存") {
                            if save() { withAnimation { isExpanded = false } }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(!canSave)
                    }
                }
                .padding(.leading, 34)
                .accessibilityIdentifier("task-details-\(task.id)")
            }
        }
        .padding(.vertical, 3)
        .accessibilityIdentifier("task-row-\(task.id)")
        .onChange(of: titleFocused) { _, focused in
            if !focused && editingTitle { saveAndFinishTitle() }
        }
        .onChange(of: task.updatedAt) { _, _ in
            guard !editingTitle && !isExpanded else { return }
            resetDrafts()
        }
    }

    private var effectivePriority: CuePriority {
        priority ?? CueTask(
            runID: task.runID,
            title: title,
            dueAt: selectedDueAt,
            sortOrder: task.sortOrder
        ).effectivePriority()
    }

    private var metadata: String {
        var values: [String] = []
        if let availableFrom = task.availableFrom {
            values.append("開始 \(Self.dateFormatter.string(from: availableFrom))")
        }
        if let dueAt = task.dueAt {
            values.append("期限 \(Self.dateFormatter.string(from: dueAt))")
        }
        return values.joined(separator: "・")
    }

    private func saveAndFinishTitle() {
        guard canSave else {
            title = task.title
            editingTitle = false
            return
        }
        if save() { editingTitle = false }
    }

    @discardableResult
    private func save() -> Bool {
        guard canSave else { return false }
        return onSave(title, priority, selectedAvailableFrom, selectedDueAt)
    }

    private func resetDrafts() {
        title = task.title
        priority = task.userPriority
        hasAvailableFrom = task.availableFrom != nil
        availableFrom = task.availableFrom ?? .now
        hasDueDate = task.dueAt != nil
        dueAt = task.dueAt ?? .now
    }

    private func priorityColor(_ priority: CuePriority) -> Color {
        priority == .strong ? Color.cueTeal : priority == .medium ? Color.cueGreen : Color.secondary
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.setLocalizedDateFormatFromTemplate("Md")
        return formatter
    }()
}
