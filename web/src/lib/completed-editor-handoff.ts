/** Selection intent only. The fragment contains IDs, never private task text. */
export function completedEditorSelection(hash: string, availableIds: string[]): string[] | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (!params.has("edit_tasks")) return null;
  const ids = (params.get("edit_tasks") ?? "").split(",");
  if (params.getAll("edit_tasks").length !== 1 || ids.length === 0 ||
      ids.some((id) => !/^[A-Za-z0-9_-]{1,128}$/.test(id) || !availableIds.includes(id)) ||
      new Set(ids).size !== ids.length) {
    throw new Error("選択した完了タスクを読み込めませんでした。Androidで内容を選び直してください。");
  }
  return availableIds.filter((id) => ids.includes(id));
}
