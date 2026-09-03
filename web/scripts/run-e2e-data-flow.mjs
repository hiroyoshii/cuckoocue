const baseUrl = process.env.CUE_SCENARIO_BASE_URL || "http://localhost:3100";
const devUserId = process.env.CUE_SCENARIO_USER_ID || `e2e-${Date.now()}`;
const idToken = process.env.CUE_ID_TOKEN;

const report = {
  started_at: new Date().toISOString(),
  base_url: baseUrl,
  user: idToken ? "firebase-authenticated" : devUserId,
  steps: [],
};

const lists = [
  {
    key: "tokyo-nagoya",
    title: "東京から名古屋への引っ越し手続き",
    tasks: [
      task("退去日と入居日を確定する", 0, -35, -28),
      task("引越し業者の見積もりと搬出入時間を確定する", 0, -30, -25),
      task("東京側の転出届に必要な書類を確認する", 0, -21, -18),
      task("名古屋側の転入届の提出先と持ち物を確認する", 0, -14, -10),
      task("電気、ガス、水道の停止と開始を申し込む", 1, -14, -7),
      task("郵便転送と各サービスの住所変更を申し込む", 1, -7, -4),
      task("旧居の清掃と鍵返却を完了する", 2, -3, 0),
    ],
  },
  {
    key: "london-brighton",
    title: "ロンドンからブライトンへの引っ越し手続き",
    tasks: [
      task("退去日、入居日、tenancy agreement の開始日を確認する", 0, -35, -28),
      task("removal company の見積もりと搬出入 slot を予約する", 0, -30, -24),
      task("London 側の council tax close date を確認する", 0, -28, -21),
      task("Brighton & Hove City Council の council tax account を作る", 0, -21, -14),
      task("electricity、gas、water、broadband の移転を申し込む", 1, -14, -10),
      task("Royal Mail redirection を申し込む", 1, -14, -10),
      task("GP、driving licence、bank、employer の住所を更新する", 2, -7, -4),
    ],
  },
  {
    key: "tokyo-trip",
    title: "東京旅行の準備",
    tasks: [
      task("新幹線または航空券の料金と到着時間を比較する", 0, -30, -21),
      task("ホテルの場所と目的地への移動時間を確認する", 0, -30, -21),
      task("浅草、上野、渋谷の行きたい場所を整理する", 1, -21, -14),
      task("Suica、充電器、雨具を持ち物に入れる", 1, -14, -7),
      task("予約が必要なレストランや美術館を確認する", 1, -14, -7),
      task("前日に天気、交通情報、チェックイン時間を確認する", 2, -1, 0),
    ],
  },
];

async function main() {
  const events = [
    memory("android_task_added", "平日に電話が必要な手続きは避け、オンライン手続きを追加した"),
    memory("android_priority_changed", "役所とライフラインの手続きを強い項目として扱った"),
    memory("android_relative_date_changed", "期限のある手続きは週末より前に終える日程へ変更した"),
    memory("android_task_reordered", "オンラインで完了できる手続きを先に並べた"),
  ];
  for (const event of events) {
    await step("memory_event", event, () => request("POST", "/api/memory-events", event));
  }

  const saved = {};
  for (const list of lists) {
    const operationId = crypto.randomUUID();
    const input = { operation_id: operationId, title: list.title, tasks: list.tasks };
    const first = await step(`save:${list.key}`, input, () => request("POST", "/api/task-list-entries", input));
    const repeated = await step(`save_idempotent_retry:${list.key}`, input, () => request("POST", "/api/task-list-entries", input));
    assert(first.entry.id === repeated.entry.id, "idempotent retry returned a different corpus id");
    assert(first.entry.tasks.every((item) => item.default_priority == null || item.default_priority in {0:1,1:1,2:1}), "priority escaped the 0/1/2 contract");
    saved[list.key] = first.entry;
  }

  await expectedFailure(
    "reject_invalid_range",
    400,
    { operation_id: crypto.randomUUID(), title: "invalid", tasks: [task("逆転した期間", 0, 2, -1)] },
  );
  await expectedFailure(
    "reject_invalid_priority",
    400,
    { operation_id: crypto.randomUUID(), title: "invalid", tasks: [task("不正な強さ", 3, -1, 0)] },
  );
  await expectedFailure(
    "reject_public_personal_data",
    422,
    { operation_id: crypto.randomUUID(), title: "連絡先", tasks: [task("foo@example.com に連絡する", 1, -1, 0)] },
  );

  const searches = [
    ["specific-japan", "東京から名古屋へ引っ越す。転出届、転入届、ライフライン、郵便転送を整理したい", "tokyo-nagoya"],
    ["specific-uk", "ロンドンからブライトンへ引っ越す。council tax、Royal Mail、GP、utilities を整理したい", "london-brighton"],
    ["tokyo-trip", "東京へ旅行する。宿泊、移動、観光、持ち物と予約を整理したい", "tokyo-trip"],
  ];
  for (const [label, message, expectedKey] of searches) {
    const result = await step(`search:${label}`, { message }, () => request("POST", "/api/search", { message, page_size: 20 }));
    assert(result.results[0]?.id === saved[expectedKey].id, `${label} did not rank the expected list first`);
  }

  const firstPage = await step("paging:first", { message: "東京", page_size: 1 }, () =>
    request("POST", "/api/search", { message: "東京", page_size: 1 }),
  );
  assert(firstPage.results.length === 1 && firstPage.nextCursor, "first page did not return an opaque cursor");
  const secondPage = await step("paging:second", { cursor: "[redacted]", page_size: 1 }, () =>
    request("POST", "/api/search", { cursor: firstPage.nextCursor, page_size: 1 }),
  );
  assert(secondPage.results.length === 1, "second page did not use the original BigQuery job");

  const imported = await step("import_payload", { id: saved["tokyo-nagoya"].id, target_anchor_day: "2026-10-01" }, () =>
    request("GET", `/api/import-payload/${saved["tokyo-nagoya"].id}?target_anchor_day=2026-10-01`),
  );
  assert(imported.importPayload.tasks.length === lists[0].tasks.length, "import lost tasks");
  assert(imported.importPayload.tasks[0].default_priority === 0, "import changed priority semantics");
  assert(imported.importPayload.task_groupings, "Web import preview should retain BQ grouping");

  report.completed_at = new Date().toISOString();
  report.status = "passed";
  console.log(JSON.stringify(report, null, 2));
}

function task(text, default_priority, relative_start_day, relative_end_day) {
  return { text, default_priority, relative_start_day, relative_end_day };
}

function memory(kind, text) {
  return { event_id: crypto.randomUUID(), kind, text, occurred_at: new Date().toISOString() };
}

async function step(name, input, operation) {
  const started = Date.now();
  const output = await retry(operation, 2);
  report.steps.push({ name, duration_ms: Date.now() - started, input, output: sanitize(output) });
  return output;
}

async function expectedFailure(name, expectedStatus, input) {
  const result = await rawRequest("POST", "/api/task-list-entries", input);
  assert(result.status === expectedStatus, `${name}: expected ${expectedStatus}, got ${result.status}`);
  report.steps.push({ name, input, output: result });
}

async function request(method, path, body) {
  const result = await rawRequest(method, path, body);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${path} failed: ${result.status} ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

async function rawRequest(method, path, body) {
  const headers = { "content-type": "application/json" };
  if (idToken) headers.authorization = `Bearer ${idToken}`;
  else headers["x-dev-user-id"] = devUserId;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

async function retry(operation, attempts) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    key === "context_embedding" ? `[${item?.length ?? 0} values]` : key === "nextCursor" && item ? "[opaque cursor]" : sanitize(item),
  ]));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
