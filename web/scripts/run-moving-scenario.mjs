const baseUrl = process.env.CUE_SCENARIO_BASE_URL || "http://localhost:3000";
const devUserId = process.env.CUE_SCENARIO_USER_ID || "scenario-tokyo-nagoya";

const headers = {
  "content-type": "application/json",
  "x-dev-user-id": devUserId,
};

const events = [
  {
    day: "2026-08-03",
    kind: "android_task_added",
    text: "名古屋市の区役所で必要な転入届の持ち物を確認するタスクを追加した。",
  },
  {
    day: "2026-08-05",
    kind: "android_task_reordered",
    text: "退去連絡と引越し業者見積もりを上位に移動した。日程が決まらないと他の手続きが進まない。",
  },
  {
    day: "2026-08-08",
    kind: "android_relative_date_changed",
    text: "電気、ガス、水道の停止と開始の期限を引越し7日前に前倒しした。",
  },
  {
    day: "2026-08-12",
    kind: "android_priority_changed",
    text: "郵便転送と銀行住所変更の優先度を上げた。本人確認郵便の受け取り漏れが不安。",
  },
  {
    day: "2026-08-16",
    kind: "android_task_edited",
    text: "転出届タスクを、東京側の転出届と名古屋側の転入届に分けた。",
  },
  {
    day: "2026-08-21",
    kind: "android_focus_adjusted",
    text: "今週は役所、ライフライン、郵便転送だけを focus に残した。",
  },
  {
    day: "2026-08-28",
    kind: "android_task_added",
    text: "粗大ごみ回収と旧居の鍵返却を追加した。退去日直前に忘れやすい。",
  },
];

const completedList = {
  title: "東京から名古屋への引っ越し手続き",
  tasks: [
    {
      text: "現住所の退去日と新居の入居日を確定する",
      default_priority: 1,
      relative_start_day: -35,
      relative_end_day: -28,
    },
    {
      text: "引越し業者の見積もりを取り、搬出入時間を確定する",
      default_priority: 1,
      relative_start_day: -30,
      relative_end_day: -25,
    },
    {
      text: "東京側の転出届に必要な期限と本人確認書類を確認する",
      default_priority: 1,
      relative_start_day: -21,
      relative_end_day: -18,
    },
    {
      text: "名古屋側の転入届で必要な持ち物と提出先の区役所を確認する",
      default_priority: 1,
      relative_start_day: -14,
      relative_end_day: -10,
    },
    {
      text: "電気、ガス、水道の停止と開始を申し込む",
      default_priority: 2,
      relative_start_day: -14,
      relative_end_day: -7,
    },
    {
      text: "郵便転送を申し込む",
      default_priority: 2,
      relative_start_day: -14,
      relative_end_day: -7,
    },
    {
      text: "銀行、クレジットカード、携帯電話、勤務先の住所を変更する",
      default_priority: 2,
      relative_start_day: -7,
      relative_end_day: -4,
    },
    {
      text: "粗大ごみ回収、旧居清掃、鍵返却の予定を確定する",
      default_priority: 3,
      relative_start_day: -3,
      relative_end_day: 0,
    },
  ],
};

const searchMessage =
  "東京から名古屋へ引っ越す。役所の転出届と転入届、ライフライン、郵便転送、住所変更を忘れないようにしたい。";

async function main() {
  console.log(`Scenario base URL: ${baseUrl}`);
  console.log(`Scenario dev user: ${devUserId}`);

  for (const [index, event] of events.entries()) {
    await post("/api/memory-events", {
      event_id: `tokyo-nagoya:${index}:${event.day}`,
      kind: event.kind,
      text: event.text,
      occurred_at: `${event.day}T12:00:00.000Z`,
    });
  }
  console.log(`Accepted ${events.length} Memory Bank candidate events`);

  const saveBody = await post("/api/task-list-entries", completedList);
  const entry = saveBody.entry;
  console.log(`Saved task_list_entries row: ${entry.id}`);
  assert(entry.domain, "Saved entry should include an LLM-generated domain");
  assert(
    entry.context_text,
    "Saved entry should include LLM-generated context_text",
  );
  assert(
    entry.task_groupings?.length > 0,
    "Saved entry should include LLM-generated task_groupings",
  );
  console.log(
    `LLM enrichment OK: domain=${entry.domain}, groups=${entry.task_groupings.length}`,
  );

  const searchBody = await post("/api/search", { message: searchMessage });
  const topResult = searchBody.results?.[0];
  assert(topResult, "Expected at least one search result");
  assert(
    topResult.id === entry.id,
    `Expected saved entry to rank first, got ${topResult.id}`,
  );
  assert(
    topResult.text_matched === true,
    "Search result should come from the text-matched candidate set",
  );
  assert(
    topResult.context_score > 0.65,
    `Expected context score above threshold, got ${topResult.context_score}`,
  );
  console.log(
    `Search top result: ${topResult.title} context_score=${topResult.context_score.toFixed(3)}`,
  );

  const importBody = await get(
    `/api/import-payload/${entry.id}?target_anchor_day=2026-09-01`,
  );
  assert(
    importBody.importPayload?.source_task_list_entry_id === entry.id,
    "Import payload should retain source_task_list_entry_id",
  );
  assert(
    importBody.importPayload?.relative_day_anchor === "target_anchor_day",
    "Import payload should declare the relative day anchor",
  );
  assert(
    importBody.importPayload?.target_anchor_day === "2026-09-01",
    "Import payload should include the user-selected target anchor day",
  );
  assert(
    importBody.importPayload?.tasks?.length === completedList.tasks.length,
    "Import payload should include all tasks",
  );
  assert(
    importBody.importPayload.tasks[0].relative_start_day === -35,
    "Import payload should preserve relative_start_day",
  );
  assert(
    importBody.importPayload.tasks[0].relative_end_day === -28,
    "Import payload should preserve relative_end_day",
  );
  console.log(
    `Import payload OK: ${importBody.importPayload.tasks.length} tasks for Android`,
  );
}

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return readResponse(response, path);
}

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  return readResponse(response, path);
}

async function readResponse(response, path) {
  const text = await response.text();
  const body = text ? tryJson(text) : {};
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function assert(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
