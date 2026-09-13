"use client";

import { firebaseAuth, hasFirebaseClientConfig } from "./firebase-client";

export function cueAccountId(devUserId: string): string {
  return hasFirebaseClientConfig() ? firebaseAuth().currentUser?.uid ?? "guest" : devUserId;
}

export async function cueApiFetch(
  path: string,
  devUserId: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  let requestedUser: string | undefined;
  headers.set("content-type", "application/json");

  if (hasFirebaseClientConfig()) {
    const auth = firebaseAuth();
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Google アカウントでログインしてください。");
    }
    if (user.uid !== devUserId) throw new Error("アカウントが変更されました。もう一度操作してください。");
    requestedUser = user.uid;
    headers.set("authorization", `Bearer ${await user.getIdToken()}`);
    if (auth.currentUser?.uid !== requestedUser) throw new Error("アカウントが変更されました。もう一度操作してください。");
  } else {
    headers.set("x-dev-user-id", devUserId);
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });
  if (requestedUser && firebaseAuth().currentUser?.uid !== requestedUser) throw new Error("アカウントが変更されました。もう一度操作してください。");
  return response;
}
