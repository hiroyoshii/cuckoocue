import { NextRequest } from "next/server";
import { cueEnv } from "./env";
import { adminAuth } from "./firebase-admin";

export async function requireUserId(request: NextRequest): Promise<string> {
  const devUserId = request.headers.get("x-dev-user-id");
  if (cueEnv.allowDevAuth() && devUserId) {
    return devUserId;
  }

  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer (.+)$/i);
  if (!match) {
    throw new Response("Missing bearer token", { status: 401 });
  }

  const token = await adminAuth().verifyIdToken(match[1]);
  return token.uid;
}
