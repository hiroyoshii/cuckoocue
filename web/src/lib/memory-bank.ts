import { GoogleAuth } from "google-auth-library";
import { cueEnv } from "./env";
import { withRetry } from "./resilience";

import type { z } from "zod";
import type { memoryEventKindSchema } from "./schema";

export type MemoryEventKind = z.infer<typeof memoryEventKindSchema>;

export type MemoryEvent = {
  eventId: string;
  userId: string;
  kind: MemoryEventKind;
  text: string;
  occurredAt: string;
};

type RetrieveProfilesResponse = {
  profiles?: Record<string, { profile?: Record<string, unknown>; schemaId?: string }>;
};
type OperationResponse = { name?: string; done?: boolean; error?: { message?: string } };

let authClient: GoogleAuth | null = null;

function vertexAiBaseUrl() {
  return `https://${cueEnv.googleCloudLocation()}-aiplatform.googleapis.com/v1beta1`;
}

function googleAuth() {
  authClient ??= new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  return authClient;
}

export async function ingestMemoryEvent(event: MemoryEvent): Promise<void> {
  const url = `${vertexAiBaseUrl()}/${cueEnv.memoryBankName()}/memories:ingestEvents`;
  const response = await withRetry(
    () =>
      googleAuth().request({
        url,
        method: "POST",
        timeout: 10000,
        data: {
          scope: { user_id: event.userId },
          streamId: cueEnv.memoryBankStreamId(),
          directContentsSource: {
            events: [
              {
                eventId: event.eventId,
                eventTime: event.occurredAt,
                content: {
                  role: "user",
                  parts: [{ text: event.text }],
                },
              },
            ],
          },
          generationTriggerConfig: {
            generationRule: {
              eventCount: 1,
            },
          },
          forceFlush: true,
        },
      }),
    { attempts: 2, timeoutMs: 12000, delayMs: 500 },
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Memory Bank ingestion failed: ${response.status}`);
  }
}

export async function retrieveUserProfileAttributes(userId: string): Promise<string[]> {
  const url = `${vertexAiBaseUrl()}/${cueEnv.memoryBankName()}/memories:retrieveProfiles`;
  const response = await withRetry(
    () =>
      googleAuth().request<RetrieveProfilesResponse>({
        url,
        method: "POST",
        timeout: 8000,
        data: {
          scope: { user_id: userId },
        },
      }),
    { attempts: 2, timeoutMs: 10000, delayMs: 500 },
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Memory Bank profile retrieval failed: ${response.status}`);
  }

  const schemaId = cueEnv.memoryProfileSchemaId();
  const profile =
    response.data.profiles?.[schemaId]?.profile ??
    Object.values(response.data.profiles ?? {}).find(
      (candidate) => candidate.schemaId === schemaId,
    )?.profile;

  if (!profile) {
    return [];
  }

  const attributes = Object.entries(profile).flatMap(([key, value]) => {
    if (Array.isArray(value)) {
      return value
        .map((phrase) => String(phrase).trim())
        .filter(Boolean)
        .map((phrase) => `${key}: ${phrase}`);
    }

    if (value === null || value === undefined) {
      return [];
    }

    const phrase = String(value).trim();
    return phrase ? [`${key}: ${phrase}`] : [];
  });
  return Array.from(new Set(attributes));
}

export async function purgeUserMemories(userId: string): Promise<void> {
  const escaped = userId.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const response = await googleAuth().request<OperationResponse>({
    url: `${vertexAiBaseUrl()}/${cueEnv.memoryBankName()}/memories:purge`,
    method: "POST",
    timeout: 15_000,
    data: { filter: `scope.user_id="${escaped}"`, force: true },
  });
  if (response.status < 200 || response.status >= 300 || !response.data.name) {
    throw new Error(`Memory Bank purge failed: ${response.status}`);
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const operation = await googleAuth().request<OperationResponse>({
      url: `${vertexAiBaseUrl()}/${response.data.name}`,
      method: "GET",
      timeout: 10_000,
    });
    if (operation.data.error) throw new Error(operation.data.error.message ?? "Memory Bank purge failed");
    if (operation.data.done) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Memory Bank purge timed out");
}
