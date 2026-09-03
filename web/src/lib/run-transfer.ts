export type SaveReviewTransfer = {
  version: 1;
  title: string;
  source_anchor_day: string;
  tasks: Array<{
    text: string;
    default_priority: number | null;
    relative_start_day: number | null;
    relative_end_day: number | null;
  }>;
};

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

export const MAX_TRANSFER_BYTES = 16_000;

export function decodeSaveReviewTransfer(value: string): SaveReviewTransfer | null {
  try {
    if (value.length > MAX_TRANSFER_BYTES * 2) return null;
    const parsed = JSON.parse(decodeBase64Url(value)) as SaveReviewTransfer;
    if (
      parsed.version !== 1 ||
      typeof parsed.title !== "string" ||
      !Array.isArray(parsed.tasks) ||
      parsed.tasks.length === 0 ||
      parsed.tasks.length > 50 ||
      !isValidIsoDay(parsed.source_anchor_day) ||
      !parsed.tasks.every(isSaveReviewTask)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function buildAndroidImportUri(payload: AndroidImportTransfer): string {
  if (!isAndroidImportTransfer(payload)) {
    throw new Error("Android に渡す内容が不正です。");
  }
  const encoded = encodeBase64Url(JSON.stringify(payload));
  if (new TextEncoder().encode(encoded).length > MAX_TRANSFER_BYTES) {
    throw new Error("項目数が多すぎるため Android に渡せません。項目を減らしてください。");
  }
  return `https://cuckoocue.hiyozoo.com/import?payload=${encodeURIComponent(encoded)}`;
}

export function fitsInlineAndroidImport(payload: AndroidImportTransfer): boolean {
  if (!isAndroidImportTransfer(payload)) return false;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  return Math.ceil((jsonBytes * 4) / 3) <= MAX_TRANSFER_BYTES;
}

export function isAndroidImportTransfer(value: unknown): value is AndroidImportTransfer {
  if (!value || typeof value !== "object") return false;
  const payload = value as AndroidImportTransfer;
  return Boolean(
    payload.version === 1 &&
      typeof payload.title === "string" &&
      payload.title.trim().length > 0 &&
      payload.title.length <= 240 &&
      isValidIsoDay(payload.target_anchor_day) &&
      Array.isArray(payload.tasks) &&
      payload.tasks.length > 0 &&
      payload.tasks.length <= 50 &&
      payload.tasks.every((task) =>
        Boolean(
          task &&
            typeof task.title === "string" &&
            task.title.trim().length > 0 &&
            task.title.length <= 240 &&
            isNullablePriority(task.default_priority) &&
            isNullableDay(task.relative_start_day) &&
            isNullableDay(task.relative_end_day) &&
            (task.relative_start_day == null ||
              task.relative_end_day == null ||
              task.relative_start_day <= task.relative_end_day),
        ),
      ),
  );
}

function isSaveReviewTask(value: SaveReviewTransfer["tasks"][number]): boolean {
  return Boolean(
    value &&
      typeof value.text === "string" &&
      value.text.trim().length > 0 &&
      value.text.length <= 240 &&
      isNullablePriority(value.default_priority) &&
      isNullableDay(value.relative_start_day) &&
      isNullableDay(value.relative_end_day) &&
      (value.relative_start_day == null ||
        value.relative_end_day == null ||
        value.relative_start_day <= value.relative_end_day),
  );
}

function isNullablePriority(value: unknown): boolean {
  return value === null || (Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 2);
}

function isNullableDay(value: unknown): boolean {
  return value === null || (Number.isInteger(value) && Math.abs(Number(value)) <= 3650);
}

export function isValidIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
