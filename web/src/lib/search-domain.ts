import { GoogleAuth } from "google-auth-library";
import { z } from "zod";
import { cueEnv } from "./env";
import { withRetry } from "./resilience";

const searchDomainSchema = z.object({
  domain: z.string().nullable(),
});

type GenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

let authClient: GoogleAuth | null = null;

function googleAuth() {
  authClient ??= new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  return authClient;
}

export async function mapQueryToSearchDomain(
  message: string,
  domains: string[],
): Promise<string | null> {
  const candidates = domains.map((domain) => domain.trim()).filter(Boolean);
  if (candidates.length === 0) {
    return null;
  }

  const model = process.env.CUE_LLM_MODEL || "gemini-2.5-flash";
  const url = [
    `https://${cueEnv.googleCloudLocation()}-aiplatform.googleapis.com/v1`,
    `projects/${cueEnv.projectId()}`,
    `locations/${cueEnv.googleCloudLocation()}`,
    `publishers/google/models/${model}:generateContent`,
  ].join("/");

  const response = await withRetry(
    () =>
      googleAuth().request<GenerateContentResponse>({
        url,
        method: "POST",
        timeout: 6000,
        data: {
          contents: [
            {
              role: "user",
              parts: [{ text: buildPrompt(message, candidates) }],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        },
      }),
    { attempts: 2, timeoutMs: 8000, delayMs: 300 },
  );

  const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return null;
  }

  const parsed = searchDomainSchema.parse(JSON.parse(text));
  const domain = parsed.domain?.trim();
  if (!domain) {
    return null;
  }

  return candidates.find((candidate) => candidate === domain) ?? null;
}

function buildPrompt(message: string, domains: string[]) {
  return `
ユーザの検索文を、既存の reusable task list domain のうち最も近い1件へ対応付けてください。

制約:
- 必ず candidates の文字列をそのまま返す。
- 明確に対応しない場合は null を返す。
- 地名やユーザ好みではなく、目的・活動種別を優先する。
- JSON 以外は返さない。

返却 JSON:
{ "domain": "candidate domain or null" }

candidates:
${domains.map((domain) => `- ${domain}`).join("\n")}

検索文:
${message}
`.trim();
}
