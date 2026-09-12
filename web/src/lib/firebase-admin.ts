import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { cueEnv } from "./env";

function adminApp() {
  const projectId = cueEnv.projectId();
  return getApps().find((app) => app.options.projectId === projectId)
    ?? initializeApp({ projectId }, `cuckoo-cue-${projectId}`);
}

export function adminAuth() {
  return getAuth(adminApp());
}

export function adminFirestore() {
  return getFirestore(adminApp());
}
