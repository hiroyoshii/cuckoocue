import { NextRequest, NextResponse } from "next/server";
import { requireRegisteredUserId } from "@/lib/auth";
import { listCuebooks } from "@/lib/cuebooks";
import { dataApiError } from "@/lib/bq-store";

export async function GET(request: NextRequest) {
  try {
    const owner = await requireRegisteredUserId(request);
    return NextResponse.json(await listCuebooks(owner, request.nextUrl.searchParams.get("cursor") ?? ""), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return dataApiError(error); }
}
