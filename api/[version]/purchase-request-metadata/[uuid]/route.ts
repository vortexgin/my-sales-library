import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { PurchaseRequestMetadataDeleteUseCase } from "@/app/sales/useCases/purchaseRequestMetadata/PurchaseRequestMetadataDeleteUseCase";
import { PurchaseRequestMetadataGetUseCase } from "@/app/sales/useCases/purchaseRequestMetadata/PurchaseRequestMetadataGetUseCase";
import { PurchaseRequestMetadataUpdateUseCase } from "@/app/sales/useCases/purchaseRequestMetadata/PurchaseRequestMetadataUpdateUseCase";
import type { UpdatePurchaseRequestMetadataInput } from "@/app/sales/models/PurchaseRequestMetadataModel";

export const runtime = "nodejs";

async function handleGet(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new PurchaseRequestMetadataGetUseCase().exec(uuid, await actorFromRequest(request));

    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch purchase request metadata.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as UpdatePurchaseRequestMetadataInput;

    const row = await new PurchaseRequestMetadataUpdateUseCase().exec(uuid, payload, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update purchase request metadata.", getErrorStatus(error, 400));
  }
}

async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new PurchaseRequestMetadataDeleteUseCase().exec(uuid, await actorFromRequest(request));

    return ok({ message: "Purchase request metadata deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete purchase request metadata.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["sales:purchase-request-metadata:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "sales:purchase-request-metadata:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["sales:purchase-request-metadata:view:delete"]);
