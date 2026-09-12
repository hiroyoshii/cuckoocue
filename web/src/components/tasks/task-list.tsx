import { priorityLabel, relativeScheduleLabel, type TaskDraft } from "./task-values";

export function TaskList({ tasks, start = 0, metadata = false }: {
  tasks: TaskDraft[];
  start?: number;
  metadata?: boolean;
}) {
  return <ol className="read-task-list" start={start + 1}>
    {tasks.map((task, index) => <li key={start + index}>
      <span className="read-task-text">{task.text}</span>
      {metadata && (relativeScheduleLabel(task) || task.default_priority !== null) ? <span className="read-task-meta">
        {relativeScheduleLabel(task) ? <span>{relativeScheduleLabel(task)}</span> : null}
        {task.default_priority !== null ? <span className={`task-priority priority-${task.default_priority}`}>優先度 {priorityLabel(task.default_priority)}</span> : null}
      </span> : null}
    </li>)}
  </ol>;
}
