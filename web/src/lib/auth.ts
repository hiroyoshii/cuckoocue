import { NextRequest } from "next/server";
import { cueEnv } from "./env";
import { adminAuth } from "./firebase-admin";

export type RequestUser = {
  id: string;
  isAnonymous: boolean;
};

export async function requireRequestUser(request: NextRequest): Promise<RequestUser> {
  const devUserId = request.headers.get("x-dev-user-id");
  if (cueEnv.allowDevAuth() && devUserId) {
    return { id: devUserId, isAnonymous: false };
  }

  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer (.+)$/i);
  if (!match) {
    throw authError("認証情報がありません。", 401);
  }

  const token = await adminAuth().verifyIdToken(match[1]);
  return {
    id: token.uid,
    isAnonymous: token.firebase?.sign_in_provider === "anonymous",
  };
}

export async function requireUserId(request: NextRequest): Promise<string> {
  return (await requireRequestUser(request)).id;
}

export async function requireRegisteredUserId(request: NextRequest): Promise<string> {
  const user = await requireRequestUser(request);
  if (user.isAnonymous) {
    throw authError("この操作には Google ログインが必要です。", 403);
  }
  return user.id;
}

function authError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
