import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { collectFilters, fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { DeliveryOrderCreateUseCase } from "@/app/sales/useCases/deliveryOrder/DeliveryOrderCreateUseCase";
import { DeliveryOrderListUseCase } from "@/app/sales/useCases/deliveryOrder/DeliveryOrderListUseCase";
import type { CreateDeliveryOrderInput } from "@/app/sales/models/DeliveryOrderModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new DeliveryOrderListUseCase().exec(
      {
        filter: collectFilters(params),
        sortProperty: queryParam(params, "sortProperty"),
        sortDirection: queryParam(params, "sortDirection"),
        offset: queryParam(params, "offset"),
        limit: queryParam(params, "limit"),
      },
      await actorFromRequest(request),
    );
    return ok(rows);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch delivery orders.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreateDeliveryOrderInput>;

    const row = await new DeliveryOrderCreateUseCase().exec(payload as CreateDeliveryOrderInput, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create delivery order.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:delivery-order:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:delivery-order:create:create"]);
