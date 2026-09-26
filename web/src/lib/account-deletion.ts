import { bqTable, bqWrite } from "./bq-store";
import { adminFirestore } from "./firebase-admin";
import { purgeUserMemories } from "./memory-bank";

export async function deleteAccountData(owner: string): Promise<void> {
  await bqWrite(owner, "delete-account", { owner }, `
    BEGIN TRANSACTION;
    CREATE TEMP TABLE owned_revisions AS
      SELECT id FROM ${bqTable("cuebook_revisions")} WHERE owner_user_id = @owner;
    DELETE FROM ${bqTable("shelves")} WHERE created_by = @owner;
    UPDATE ${bqTable("shelves")} shelf
      SET items = ARRAY(
        SELECT AS STRUCT item.revision_id, item.position
        FROM UNNEST(shelf.items) item
        WHERE item.revision_id NOT IN (SELECT id FROM owned_revisions)
      ), updated_at = CURRENT_TIMESTAMP()
      WHERE EXISTS (
        SELECT 1 FROM UNNEST(shelf.items) item
        WHERE item.revision_id IN (SELECT id FROM owned_revisions)
      );
    DELETE FROM ${bqTable("cuebook_revisions")} WHERE owner_user_id = @owner;
    DELETE FROM ${bqTable("cuebooks")} WHERE owner_user_id = @owner;
    COMMIT TRANSACTION;
  `, { owner }, async () => []);

  await purgeUserMemories(owner);
  await adminFirestore().recursiveDelete(adminFirestore().collection("users").doc(owner));
}
