import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { collectFilters, fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { PurchaseRequestCreateUseCase } from "@/app/sales/useCases/purchaseRequest/PurchaseRequestCreateUseCase";
import { PurchaseRequestListUseCase } from "@/app/sales/useCases/purchaseRequest/PurchaseRequestListUseCase";
import type { CreatePurchaseRequestInput } from "@/app/sales/models/PurchaseRequestModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new PurchaseRequestListUseCase().exec(
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
    return fail(error.message ?? "Failed to fetch purchase requests.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreatePurchaseRequestInput>;

    const row = await new PurchaseRequestCreateUseCase().exec(payload as CreatePurchaseRequestInput, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create purchase request.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:purchase-request:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:purchase-request:create:create"]);
