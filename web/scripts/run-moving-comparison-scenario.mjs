const baseUrl = process.env.CUE_SCENARIO_BASE_URL || "http://localhost:3000";
const devUserId =
  process.env.CUE_SCENARIO_USER_ID ||
  `scenario-moving-comparison-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;

const headers = {
  "content-type": "application/json",
  "x-dev-user-id": devUserId,
};

const corpora = [
  {
    key: "tokyo-nagoya",
    events: [
      {
        day: "2026-08-03",
        kind: "android_task_added",
        text: "名古屋市の区役所で必要な転入届の持ち物を確認するタスクを追加した。",
      },
      {
        day: "2026-08-08",
        kind: "android_relative_date_changed",
        text: "電気、ガス、水道の停止と開始の期限を引越し7日前に前倒しした。",
      },
    ],
    completedList: {
      title: "東京から名古屋への引っ越し手続き",
      tasks: [
        task("現住所の退去日と新居の入居日を確定する", 1, -35, -28),
        task("引越し業者の見積もりを取り、搬出入時間を確定する", 1, -30, -25),
        task("東京側の転出届に必要な期限と本人確認書類を確認する", 1, -21, -18),
        task("名古屋側の転入届で必要な持ち物と提出先の区役所を確認する", 1, -14, -10),
        task("電気、ガス、水道の停止と開始を申し込む", 2, -14, -7),
        task("郵便転送を申し込む", 2, -14, -7),
        task("銀行、クレジットカード、携帯電話、勤務先の住所を変更する", 2, -7, -4),
        task("粗大ごみ回収、旧居清掃、鍵返却の予定を確定する", 3, -3, 0),
      ],
    },
  },
  {
    key: "london-brighton",
    events: [
      {
        day: "2026-08-06",
        kind: "android_task_added",
        text: "Brighton & Hove City Council の council tax account setup を追加した。",
      },
      {
        day: "2026-08-14",
        kind: "android_priority_changed",
        text: "GP registration と tenancy deposit の確認を優先にした。",
      },
    ],
    completedList: {
      title: "ロンドンからブライトンへの引っ越し手続き",
      tasks: [
        task("退去日、入居日、tenancy agreement の開始日を確認する", 1, -35, -28),
        task("removal company の見積もりを取り、搬出入 slot を予約する", 1, -30, -24),
        task("London 側の council tax close date と final bill を確認する", 1, -28, -21),
        task("Brighton & Hove City Council の council tax account を setup する", 1, -21, -14),
        task("electricity、gas、water、broadband の move out / move in を申し込む", 2, -14, -10),
        task("Royal Mail redirection を申し込む", 2, -14, -10),
        task("GP registration、driving licence、bank、employer の住所を更新する", 2, -7, -4),
        task("inventory check、deposit return、keys handover の予定を確定する", 3, -3, 0),
      ],
    },
  },
];

const searches = [
  {
    label: "Tokyo/Nagoya query",
    message:
      "東京から名古屋へ引っ越す。転出届、転入届、ライフライン、郵便転送、住所変更を忘れないようにしたい。",
    expectedKey: "tokyo-nagoya",
  },
  {
    label: "London/Brighton query",
    message:
      "ロンドンからブライトンへ引っ越す。council tax、Royal Mail redirection、GP registration、utilities を整理したい。",
    expectedKey: "london-brighton",
  },
  {
    label: "Generic moving query",
    message:
      "別の都市へ引っ越すので、行政手続き、生活インフラ、住所変更、退去処理をまとめたい。",
    expectedKey: null,
  },
];

async function main() {
  console.log(`Scenario base URL: ${baseUrl}`);
  console.log(`Scenario dev user: ${devUserId}`);

  const savedByKey = new Map();
  for (const corpus of corpora) {
    for (const [index, event] of corpus.events.entries()) {
      await post("/api/memory-events", {
        event_id: `${corpus.key}:${index}:${event.day}`,
        kind: event.kind,
        text: event.text,
        occurred_at: `${event.day}T12:00:00.000Z`,
      });
    }

    const saveBody = await post("/api/task-list-entries", corpus.completedList);
    const entry = saveBody.entry;
    assert(entry.domain, `${corpus.key} should include domain`);
    assert(entry.context_text, `${corpus.key} should include context_text`);
    assert(entry.task_groupings?.length > 0, `${corpus.key} should include groupings`);
    assert(entry.context_embedding?.length > 0, `${corpus.key} should include embedding`);
    assertRelativeScheduleUsesAnchorBase(corpus.key, entry);
    assertContextKeepsLocalSignals(corpus.key, entry);
    savedByKey.set(corpus.key, entry);
    console.log(
      `Saved ${corpus.key}: ${entry.id} domain=${entry.domain} groups=${entry.task_groupings.length}`,
    );
    console.log(`  context=${entry.context_text}`);
  }

  for (const search of searches) {
    const searchBody = await post("/api/search", { message: search.message });
    const rows = searchBody.results ?? [];
    assert(rows.length >= 2, `${search.label} should return both moving rows`);

    console.log(`\n${search.label}`);
    for (const row of rows.slice(0, 5)) {
      console.log(
        [
          `${row.title}`,
          `text_matched=${row.text_matched}`,
          `context_score=${format(row.context_score)}`,
        ].join(" | "),
      );
    }

    if (search.expectedKey) {
      const expectedId = savedByKey.get(search.expectedKey)?.id;
      assert(
        rows[0]?.id === expectedId,
        `${search.label} expected ${search.expectedKey} first, got ${rows[0]?.title}`,
      );
    }
  }
}

function task(text, default_priority, relative_start_day, relative_end_day) {
  return { text, default_priority: default_priority - 1, relative_start_day, relative_end_day };
}

async function post(path, body) {
  const requestBody = path === "/api/task-list-entries"
    ? { operation_id: crypto.randomUUID(), ...body }
    : body;
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });
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

function assertContextKeepsLocalSignals(key, entry) {
  const text = [
    entry.domain,
    entry.context_text,
    ...(entry.task_groupings ?? []).map((grouping) => grouping.label),
  ].join("\n");

  if (key === "tokyo-nagoya") {
    assert(
      /日本|東京|名古屋|転出|転入|役所|区役所|ライフライン/.test(text),
      "Tokyo/Nagoya enrichment should keep Japan-specific moving signals",
    );
  }

  if (key === "london-brighton") {
    assert(
      /英国|イギリス|ロンドン|ブライトン|council|Council|tax|GP|Royal Mail|utilities/.test(
        text,
      ),
      "London/Brighton enrichment should keep UK-specific moving signals",
    );
  }
}

function assertRelativeScheduleUsesAnchorBase(key, entry) {
  const starts = entry.tasks.map((task) => task.relative_start_day);
  const ends = entry.tasks.map((task) => task.relative_end_day);
  assert(
    starts.some((offset) => offset < 0),
    `${key} should use negative start offsets before the target anchor day`,
  );
  assert(
    ends.at(-1) === 0,
    `${key} final task should end at the target anchor day`,
  );
  assert(
    entry.tasks.every(
      (task) =>
        task.relative_start_day === null ||
        task.relative_end_day === null ||
        task.relative_start_day <= task.relative_end_day,
    ),
    `${key} relative_start_day should not be after relative_end_day`,
  );
}

function format(value) {
  return Number(value ?? 0).toFixed(3);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
