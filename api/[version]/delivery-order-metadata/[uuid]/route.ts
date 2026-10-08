import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { DeliveryOrderMetadataDeleteUseCase } from "@/app/sales/useCases/deliveryOrderMetadata/DeliveryOrderMetadataDeleteUseCase";
import { DeliveryOrderMetadataGetUseCase } from "@/app/sales/useCases/deliveryOrderMetadata/DeliveryOrderMetadataGetUseCase";
import { DeliveryOrderMetadataUpdateUseCase } from "@/app/sales/useCases/deliveryOrderMetadata/DeliveryOrderMetadataUpdateUseCase";
import type { UpdateDeliveryOrderMetadataInput } from "@/app/sales/models/DeliveryOrderMetadataModel";

export const runtime = "nodejs";

async function handleGet(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new DeliveryOrderMetadataGetUseCase().exec(uuid, await actorFromRequest(request));

    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch delivery order metadata.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as UpdateDeliveryOrderMetadataInput;

    const row = await new DeliveryOrderMetadataUpdateUseCase().exec(uuid, payload, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update delivery order metadata.", getErrorStatus(error, 400));
  }
}

async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new DeliveryOrderMetadataDeleteUseCase().exec(uuid, await actorFromRequest(request));

    return ok({ message: "Delivery order metadata deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete delivery order metadata.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["sales:delivery-order-metadata:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "sales:delivery-order-metadata:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["sales:delivery-order-metadata:view:delete"]);
