import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { DeliveryOrderDeleteUseCase } from "@/app/sales/useCases/deliveryOrder/DeliveryOrderDeleteUseCase";
import { DeliveryOrderGetUseCase } from "@/app/sales/useCases/deliveryOrder/DeliveryOrderGetUseCase";
import { DeliveryOrderUpdateUseCase } from "@/app/sales/useCases/deliveryOrder/DeliveryOrderUpdateUseCase";
import type { UpdateDeliveryOrderInput } from "@/app/sales/models/DeliveryOrderModel";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new DeliveryOrderGetUseCase().exec(uuid);

    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch delivery order.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as UpdateDeliveryOrderInput;

    const row = await new DeliveryOrderUpdateUseCase().exec(uuid, payload, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update delivery order.", getErrorStatus(error, 400));
  }
}

async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new DeliveryOrderDeleteUseCase().exec(uuid, await actorFromRequest(request));

    return ok({ message: "Delivery order deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete delivery order.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["sales:delivery-order:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "sales:delivery-order:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["sales:delivery-order:view:delete"]);
