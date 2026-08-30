const baseUrl = process.env.CUE_SCENARIO_BASE_URL || "http://localhost:3000";
const runStamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const profiledUserId = process.env.CUE_PROFILED_USER_ID || `profile-ranking-profiled-${runStamp}`;
const neutralUserId = process.env.CUE_NEUTRAL_USER_ID || `profile-ranking-neutral-${runStamp}`;

const memoryEvents = [
  event(
    "2026-08-03",
    "android_task_added",
    "名古屋市の区役所で必要な転入届の持ち物を確認するタスクを追加した。",
  ),
  event(
    "2026-08-05",
    "android_task_reordered",
    "退去連絡と引越し業者見積もりを上位に移動した。日程が決まらないと他の手続きが進まない。",
  ),
  event(
    "2026-08-08",
    "android_relative_date_changed",
    "電気、ガス、水道の停止と開始の期限を引越し7日前に前倒しした。",
  ),
  event(
    "2026-08-12",
    "android_priority_changed",
    "郵便転送と銀行住所変更の優先度を上げた。本人確認郵便の受け取り漏れが不安。",
  ),
  event(
    "2026-08-16",
    "android_task_edited",
    "転出届タスクを、東京側の転出届と名古屋側の転入届に分けた。",
  ),
  event(
    "2026-08-21",
    "android_focus_adjusted",
    "今週は役所、ライフライン、郵便転送だけを focus に残した。",
  ),
  event(
    "2026-08-24",
    "android_task_edited",
    "電話が必要な手続きは避け、オンラインでできる住所変更を先に進めるように書き換えた。",
  ),
  event(
    "2026-08-28",
    "android_task_added",
    "粗大ごみ回収と旧居の鍵返却を追加した。退去日直前に忘れやすい。",
  ),
];

const completedLists = [
  {
    key: "tokyo-nagoya",
    body: {
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
    body: {
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
  {
    key: "tokyo-trip",
    body: {
      title: "東京旅行の準備",
      tasks: [
        task("新幹線または航空券の料金と到着時間を比較する", 1, -30, -21),
        task("ホテルの場所を山手線沿線と目的地への移動時間で確認する", 1, -30, -21),
        task("浅草、上野、渋谷、丸の内の行きたい場所を候補に分ける", 2, -21, -14),
        task("Suica、モバイル決済、充電器、雨具を持ち物リストに入れる", 2, -14, -7),
        task("レストランや美術館など予約が必要な場所を確認する", 2, -14, -7),
        task("東京駅または羽田空港から宿泊先までの移動経路を保存する", 1, -7, -3),
        task("旅行前日に天気、交通情報、チェックイン時間を確認する", 1, -1, 0),
      ],
    },
  },
];

const searches = [
  search("specific_japan", "東京から名古屋へ引っ越す。転出届、転入届、ライフライン、郵便転送、住所変更を忘れないようにしたい。"),
  search("specific_uk", "ロンドンからブライトンへ引っ越す。council tax、Royal Mail redirection、GP registration、utilities を整理したい。"),
  search("generic_moving", "別の都市へ引っ越すので、行政手続き、生活インフラ、住所変更、退去処理をまとめたい。"),
  search("tokyo_trip", "東京へ旅行する。宿泊、移動、観光、持ち物、予約、当日の交通を整理したい。"),
  search("generic_tokyo", "東京に行く予定があるので、必要な準備をまとめたい。"),
  search("ambiguous_online", "オンラインでできる手続きを優先して、直前に忘れそうな準備を整理したい。"),
];

async function main() {
  printJson("run", { baseUrl, profiledUserId, neutralUserId });

  printJson("memory_events_input", memoryEvents);
  const memoryEventResponses = [];
  for (const [index, input] of memoryEvents.entries()) {
    memoryEventResponses.push({
      input,
      response: await post(profiledUserId, "/api/memory-events", {
        event_id: `${profiledUserId}:${index}:${input.day}:${input.kind}`,
        kind: input.kind,
        text: input.text,
        occurred_at: `${input.day}T12:00:00.000Z`,
      }),
    });
  }
  printJson("memory_events_post_results", memoryEventResponses);

  printJson("completed_lists_input", completedLists);
  const saved = { [profiledUserId]: [], [neutralUserId]: [] };
  for (const userId of [profiledUserId, neutralUserId]) {
    for (const item of completedLists) {
      const result = await post(userId, "/api/task-list-entries", item.body);
      saved[userId].push({ key: item.key, entry: redactEmbedding(result.entry) });
    }
  }
  printJson("save_results", saved);

  const profileProbe = await searchWithRetry(profiledUserId, "引っ越し準備。オンライン手続きと役所手続きを優先したい。");
  printJson("profile_observation_via_search", {
    userProfileAttributes: profileProbe.userProfileAttributes,
    resultCount: profileProbe.results?.length ?? 0,
  });

  const comparisons = [];
  for (const query of searches) {
    const profiled = await post(profiledUserId, "/api/search", { message: query.message });
    const neutral = await post(neutralUserId, "/api/search", { message: query.message });
    comparisons.push({
      label: query.label,
      request: query.message,
      profiled_user: summarizeSearch(profiled),
      neutral_user: summarizeSearch(neutral),
    });
  }
  printJson("search_comparisons", comparisons);

  const imports = [];
  for (const item of saved[profiledUserId]) {
    imports.push({
      key: item.key,
      response: await get(
        profiledUserId,
        `/api/import-payload/${item.entry.id}?target_anchor_day=2026-09-01`,
      ),
    });
  }
  printJson("import_payloads_profiled_user", imports);
}

function event(day, kind, text) {
  return { day, kind, text };
}

function task(text, default_priority, relative_start_day, relative_end_day) {
  return { text, default_priority, relative_start_day, relative_end_day };
}

function search(label, message) {
  return { label, message };
}

function printJson(name, value) {
  console.log(`\\n=== ${name} ===`);
  console.log(JSON.stringify(value, null, 2));
}

function summarizeSearch(result) {
  return {
    userProfileAttributes: result.userProfileAttributes,
    results: (result.results ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      domain: row.domain,
      context_text: row.context_text,
      text_matched: row.text_matched,
      context_score: row.context_score,
      task_groupings: row.task_groupings,
      tasks: row.tasks,
    })),
  };
}

function redactEmbedding(entry) {
  return {
    ...entry,
    context_embedding_length: entry.context_embedding?.length ?? 0,
    context_embedding_first5: entry.context_embedding?.slice(0, 5) ?? [],
    context_embedding: undefined,
  };
}

async function searchWithRetry(userId, message) {
  let result;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    result = await post(userId, "/api/search", { message });
    if ((result.userProfileAttributes ?? []).length > 0) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 10000));
  }
  return result;
}

async function post(userId, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: headers(userId),
    body: JSON.stringify(body),
  });
  return readResponse(response, path);
}

async function get(userId, path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: headers(userId) });
  return readResponse(response, path);
}

function headers(userId) {
  return {
    "content-type": "application/json",
    "x-dev-user-id": userId,
  };
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
