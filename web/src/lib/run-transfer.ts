export type AndroidImportTransfer = {
  version: 1;
  title: string;
  target_anchor_day: string;
  tasks: Array<{
    title: string;
    default_priority: number | null;
    relative_start_day: number | null;
    relative_end_day: number | null;
  }>;
};

export function buildAndroidRunUri(runId: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(runId)) throw new Error("Run IDが不正です。");
  return `https://cuckoocue.hiyozoo.com/import?${new URLSearchParams({ run_id: runId })}`;
}

export function buildAndroidImportUri(entryId: string, targetAnchorDay: string): string {
  if (!entryId.trim() || !isValidIsoDay(targetAnchorDay)) {
    throw new Error("Android に渡す参照が不正です。");
  }
  const params = new URLSearchParams({
    entry_id: entryId,
    target_anchor_day: targetAnchorDay,
  });
  return `https://cuckoocue.hiyozoo.com/import?${params}`;
}

export function buildAndroidRevisionImportUri(revisionId: string, targetAnchorDay: string): string {
  if (!revisionId.trim() || !isValidIsoDay(targetAnchorDay)) {
    throw new Error("Android に渡す参照が不正です。");
  }
  const params = new URLSearchParams({
    revision_id: revisionId,
    target_anchor_day: targetAnchorDay,
  });
  return `https://cuckoocue.hiyozoo.com/import?${params}`;
}

export function isValidIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
