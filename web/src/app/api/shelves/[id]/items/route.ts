export async function POST() {
  return Response.json({ error: "配置一式と更新前の版を指定してグループを更新してください。" }, { status: 410 });
}
