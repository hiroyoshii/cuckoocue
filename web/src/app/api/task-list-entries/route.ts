export async function POST() {
  return Response.json({ error: "原本を自分用に保存してから、グループへ公開してください。" }, { status: 410 });
}
