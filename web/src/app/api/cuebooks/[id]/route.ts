import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRegisteredUserId } from "@/lib/auth";
import { getCuebook, saveCuebook } from "@/lib/cuebooks";
import { saveCuebookSchema } from "@/lib/cuebook-schema";
import { dataApiError } from "@/lib/bq-store";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const owner = await requireRegisteredUserId(request);
    const { id } = await context.params;
    const cuebook = await getCuebook(owner, z.string().uuid().parse(id));
    if (!cuebook) return NextResponse.json({ error: "リストが見つかりません。" }, { status: 404 });
    return NextResponse.json({ cuebook }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return dataApiError(error); }
}

export async function PUT(request: NextRequest, context: Context) {
  try {
    const owner = await requireRegisteredUserId(request);
    const { id } = await context.params;
    const input = saveCuebookSchema.parse(await request.json());
    return NextResponse.json({ cuebook: await saveCuebook(owner, z.string().uuid().parse(id), input) });
  } catch (error) { return dataApiError(error); }
}
