import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "./firebase-admin";

export async function setShelfMembership(owner: string, id: string, joined: boolean) {
  await adminFirestore().collection("users").doc(owner).set({
    shelf_ids: joined ? FieldValue.arrayUnion(id) : FieldValue.arrayRemove(id),
  }, { merge: true });
}

export async function getShelfMemberships(owner: string): Promise<string[]> {
  const snapshot = await adminFirestore().collection("users").doc(owner).get();
  const ids: unknown = snapshot.data()?.shelf_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}
