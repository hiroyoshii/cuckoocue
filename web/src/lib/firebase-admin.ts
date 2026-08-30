import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export function adminAuth() {
  if (getApps().length === 0) {
    initializeApp();
  }

  return getAuth();
}
