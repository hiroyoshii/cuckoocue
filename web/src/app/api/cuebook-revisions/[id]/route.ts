import { getPublicRevisionDetail } from "@/lib/shelves";
import { dataApiError } from "@/lib/bq-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const revision = await getPublicRevisionDetail(id);
    if (revision?.withdrawn_at) return Response.json({ error: "この公開版は公開を停止しています。" }, { status: 410 });
    return revision ? Response.json({ revision }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }) : Response.json({ error: "公開版が見つかりません。" }, { status: 404 });
  } catch (error) { return dataApiError(error); }
}
