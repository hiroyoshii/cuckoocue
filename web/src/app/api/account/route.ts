import { NextRequest, NextResponse } from "next/server";
import { deleteAccountData } from "@/lib/account-deletion";
import { requireRegisteredUserId } from "@/lib/auth";
import { dataApiError } from "@/lib/bq-store";

export async function DELETE(request: NextRequest) {
  try {
    const owner = await requireRegisteredUserId(request);
    await deleteAccountData(owner);
    return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return dataApiError(error);
  }
}
