import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { DeliveryOrderShipUseCase } from "@/app/sales/useCases/deliveryOrder/DeliveryOrderShipUseCase";

export const runtime = "nodejs";

async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as { fulfillment?: string; notes?: string | null };

    const row = await new DeliveryOrderShipUseCase().exec(
      uuid,
      { fulfillment: payload.fulfillment as "system" | "paper", notes: payload.notes ?? null },
      await actorFromRequest(request),
    );
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to ship delivery order.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["sales:delivery-order:view:ship"]);
