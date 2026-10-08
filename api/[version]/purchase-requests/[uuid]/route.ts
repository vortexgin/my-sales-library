import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { PurchaseRequestDeleteUseCase } from "@/app/sales/useCases/purchaseRequest/PurchaseRequestDeleteUseCase";
import { PurchaseRequestGetUseCase } from "@/app/sales/useCases/purchaseRequest/PurchaseRequestGetUseCase";
import { PurchaseRequestUpdateUseCase } from "@/app/sales/useCases/purchaseRequest/PurchaseRequestUpdateUseCase";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new PurchaseRequestGetUseCase().exec(uuid);

    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch purchase request.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as Record<string, unknown>;

    const row = await new PurchaseRequestUpdateUseCase().exec(uuid, payload, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update purchase request.", getErrorStatus(error, 400));
  }
}

async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new PurchaseRequestDeleteUseCase().exec(uuid, await actorFromRequest(request));

    return ok({ message: "Purchase request deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete purchase request.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["sales:purchase-request:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "sales:purchase-request:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["sales:purchase-request:view:delete"]);
