import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { PosTransactionSendReceiptUseCase } from "@/app/sales/useCases/posTransaction/PosTransactionSendReceiptUseCase";

export const runtime = "nodejs";

async function handlePost(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new PosTransactionSendReceiptUseCase().exec(uuid, await actorFromRequest(_request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to send receipt.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["sales:pos-transaction:view:detail"]);
