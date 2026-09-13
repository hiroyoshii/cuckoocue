import { NextRequest, NextResponse } from "next/server";
import { requireRegisteredUserId } from "@/lib/auth";
import { generateShelfDescription, shelfDescriptionInputSchema } from "@/lib/shelf-description";

export async function POST(request: NextRequest) {
  try {
    await requireRegisteredUserId(request);
    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "入力内容を確認してください。" }, { status: 400 }); }
    const input = shelfDescriptionInputSchema.safeParse(body);
    if (!input.success) return NextResponse.json({ error: "名前・状況の生成に使う内容を確認してください。" }, { status: 400 });
    const description = await generateShelfDescription(input.data);
    return NextResponse.json({ description });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof SyntaxError) return NextResponse.json({ error: "名前・状況を生成できませんでした。再試行してください。" }, { status: 503 });
    console.error("Shelf description generation failed", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ error: "名前・状況を生成できませんでした。入力は残っています。再試行してください。" }, { status: 503 });
  }
}
