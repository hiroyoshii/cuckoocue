const MaximumReportBytes = 16_384;
const MaximumReportsPerMinute = 60;
let reportWindow = { minute: 0, count: 0 };

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MaximumReportBytes) return new Response(null, { status: 413 });
  try {
    const raw = await request.text();
    if (raw.length > MaximumReportBytes) return new Response(null, { status: 413 });
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const report = (parsed["csp-report"] ?? parsed.body ?? parsed) as Record<string, unknown>;
    const documentOrigin = origin(report["document-uri"] ?? report.documentURL);
    if (!isAllowedDocumentOrigin(documentOrigin) || !takeReportSlot()) return new Response(null, { status: 204 });
    console.warn(JSON.stringify({
      event: "security.csp_violation",
      effective_directive: short(report["effective-directive"] ?? report.effectiveDirective),
      violated_directive: short(report["violated-directive"] ?? report.violatedDirective),
      blocked_origin: origin(report["blocked-uri"] ?? report.blockedURL),
      document_origin: documentOrigin,
      disposition: short(report.disposition),
      status_code: Number(report["status-code"] ?? report.statusCode) || 0,
    }));
  } catch {
    return new Response(null, { status: 400 });
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

function takeReportSlot() {
  const minute = Math.floor(Date.now() / 60_000);
  if (reportWindow.minute !== minute) reportWindow = { minute, count: 0 };
  reportWindow.count += 1;
  return reportWindow.count <= MaximumReportsPerMinute;
}

function isAllowedDocumentOrigin(value: string | null) {
  return value === "https://cuckoocue.hiyozoo.com"
    || value === "https://cuckoocue--cuckoocue.asia-east1.hosted.app";
}

function short(value: unknown) {
  return typeof value === "string" ? value.slice(0, 160) : null;
}

function origin(value: unknown) {
  if (typeof value !== "string") return null;
  if (value === "inline" || value === "eval") return value;
  try { return new URL(value).origin; } catch { return "invalid"; }
}
