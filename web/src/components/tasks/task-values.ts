export type TaskDraft = {
  text: string;
  default_priority: number | null;
  relative_start_day: number | null;
  relative_end_day: number | null;
};

export function relativeDayLabel(day: number) {
  if (day === 0) return "当日";
  if (day === -1) return "前日";
  if (day === 1) return "翌日";
  const days = Math.abs(day);
  const amount = days % 7 === 0 ? `${days / 7}週間` : `${days}日`;
  return `${amount}${day < 0 ? "前" : "後"}`;
}

export function relativeScheduleLabel(task: TaskDraft) {
  const start = task.relative_start_day;
  const end = task.relative_end_day;
  if (start === null && end === null) return "";
  if (start === end) return start === 0 ? "当日" : `最終日の${relativeDayLabel(start!)}`;
  if (start === null) return end === 0 ? "当日まで" : `最終日の${relativeDayLabel(end!)}まで`;
  if (end === null) return `最終日の${relativeDayLabel(start)}から`;
  return `最終日の${relativeDayLabel(start)}〜${relativeDayLabel(end)}`;
}

export function priorityLabel(priority: number | null) {
  return priority === null ? "未設定" : ["強", "中", "弱"][priority] ?? "未設定";
}

export function taskErrors(task: TaskDraft) {
  return {
    text: !task.text.trim() ? "タスクの内容を入力してください。" : task.text.trim().length > 240 ? "240文字以内で入力してください。" : null,
    schedule: [task.relative_start_day, task.relative_end_day].some((day) => day !== null && (!Number.isInteger(day) || Math.abs(day) > 3650))
      ? "日数は0〜3650の整数で入力してください。" : task.relative_start_day !== null && task.relative_end_day !== null && task.relative_start_day > task.relative_end_day
      ? "開始を期限以前にしてください。" : null,
  };
}
