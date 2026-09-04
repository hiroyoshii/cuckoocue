import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function adminApp() {
  return getApps()[0] ?? initializeApp();
}

export function adminAuth() {
  return getAuth(adminApp());
}

export function adminFirestore() {
  return getFirestore(adminApp());
}
