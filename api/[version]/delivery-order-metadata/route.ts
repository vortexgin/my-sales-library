import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { collectFilters, fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { DeliveryOrderMetadataCreateUseCase } from "@/app/sales/useCases/deliveryOrderMetadata/DeliveryOrderMetadataCreateUseCase";
import { DeliveryOrderMetadataListUseCase } from "@/app/sales/useCases/deliveryOrderMetadata/DeliveryOrderMetadataListUseCase";
import type { CreateDeliveryOrderMetadataInput } from "@/app/sales/models/DeliveryOrderMetadataModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new DeliveryOrderMetadataListUseCase().exec({
      filter: collectFilters(params),
      sortProperty: queryParam(params, "sortProperty"),
      sortDirection: queryParam(params, "sortDirection"),
      offset: queryParam(params, "offset"),
      limit: queryParam(params, "limit"),
    }, await actorFromRequest(request));
    return ok(rows);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch delivery order metadata.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreateDeliveryOrderMetadataInput>;

    const row = await new DeliveryOrderMetadataCreateUseCase().exec(payload as CreateDeliveryOrderMetadataInput, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create delivery order metadata.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:delivery-order-metadata:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:delivery-order-metadata:create:create"]);
