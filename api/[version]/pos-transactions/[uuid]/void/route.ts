import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { PosTransactionVoidUseCase } from "@/app/sales/useCases/posTransaction/PosTransactionVoidUseCase";

export const runtime = "nodejs";

async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as { reason?: string };

    const row = await new PosTransactionVoidUseCase().exec(
      uuid,
      { reason: payload.reason as string },
      await actorFromRequest(request),
    );
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to void POS transaction.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["sales:pos-transaction:view:void"]);
