import { NextRequest, NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/auth";
import { retrieveUserProfileAttributes } from "@/lib/memory-bank";
import {
  getSearchTaskListEntriesPage,
  listTaskListDomains,
  searchTaskListEntries,
} from "@/lib/bigquery";
import { mapQueryToSearchDomain } from "@/lib/search-domain";
import { searchTaskListsSchema } from "@/lib/schema";

export async function POST(request: NextRequest) {
  try {
    const user = await requireRequestUser(request);
    const input = searchTaskListsSchema.parse(await request.json());
    const pageSize = input.page_size ?? 20;

    if (input.cursor) {
      const page = await getSearchTaskListEntriesPage(input.cursor, pageSize);
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
      mapQueryToSearchDomain(message, domains),
    );
    const [userProfileAttributes, searchDomain] = await Promise.all([
      userProfileAttributesPromise,
      searchDomainPromise,
    ]);
    const results = await searchTaskListEntries(
      message,
      userProfileAttributes,
      searchDomain,
      pageSize,
    );

    return NextResponse.json({
      memoryFacts: userProfileAttributes,
      userProfileAttributes,
      searchDomain,
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

  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 503 });
}
