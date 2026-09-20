import { NextRequest, NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/auth";
import { retrieveUserProfileAttributes } from "@/lib/memory-bank";
import {
  getSearchTaskListEntriesPage,
  listTaskListDomains,
  searchTaskListEntries,
} from "@/lib/bigquery";
import { interpretSearchQuery, selectSearchProfileAttributes } from "@/lib/search-domain";
import { searchTaskListsSchema } from "@/lib/schema";

export async function POST(request: NextRequest) {
  try {
    const user = await requireRequestUser(request);
    const parsed = searchTaskListsSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "検索条件を確認してください。" }, { status: 400 });
    const input = parsed.data;
    const pageSize = input.page_size ?? 20;

    if (input.cursor) {
      const page = await getSearchTaskListEntriesPage(input.cursor, pageSize, user.id);
      return NextResponse.json({
        memoryFacts: [],
        userProfileAttributes: [],
        searchDomain: null,
        results: page.results,
        nextCursor: page.nextCursor,
      });
    }

    const message = input.message;
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const userProfileAttributesPromise = user.isAnonymous
      ? Promise.resolve([])
      : retrieveUserProfileAttributes(user.id);
    const searchDomainPromise = listTaskListDomains().then((domains) =>
      interpretSearchQuery(message, domains),
    );
    const [userProfileAttributes, searchPlan] = await Promise.all([
      userProfileAttributesPromise,
      searchDomainPromise,
    ]);
    const rankingAttributes = await selectSearchProfileAttributes(message, userProfileAttributes, searchPlan);
    const results = await searchTaskListEntries(
      message,
      rankingAttributes,
      searchPlan,
      pageSize,
      user.id,
    );

    return NextResponse.json({
      memoryFacts: userProfileAttributes,
      userProfileAttributes,
      searchDomain: searchPlan.domain,
      results: results.results,
      nextCursor: results.nextCursor,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof Response) {
    return error;
  }
  console.error(JSON.stringify({
    event: "search.failed",
    error_type: error instanceof Error ? error.name : "unknown",
  }));
  return NextResponse.json({ error: "検索処理に失敗しました。時間をおいて再検索してください。" }, { status: 503 });
}
