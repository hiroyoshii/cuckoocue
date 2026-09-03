"use client";

import { firebaseAuth, hasFirebaseClientConfig } from "./firebase-client";

export async function cueApiFetch(
  path: string,
  devUserId: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");

  if (hasFirebaseClientConfig()) {
    const auth = firebaseAuth();
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Google アカウントでログインしてください。");
    }
    headers.set("authorization", `Bearer ${await user.getIdToken()}`);
  } else {
    headers.set("x-dev-user-id", devUserId);
  }

  return fetch(path, {
    ...init,
    headers,
  });
}
