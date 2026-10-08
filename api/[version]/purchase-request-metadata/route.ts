import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { collectFilters, fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { PurchaseRequestMetadataCreateUseCase } from "@/app/sales/useCases/purchaseRequestMetadata/PurchaseRequestMetadataCreateUseCase";
import { PurchaseRequestMetadataListUseCase } from "@/app/sales/useCases/purchaseRequestMetadata/PurchaseRequestMetadataListUseCase";
import type { CreatePurchaseRequestMetadataInput } from "@/app/sales/models/PurchaseRequestMetadataModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new PurchaseRequestMetadataListUseCase().exec(
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
    return fail(error.message ?? "Failed to fetch purchase request metadata.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreatePurchaseRequestMetadataInput>;

    const row = await new PurchaseRequestMetadataCreateUseCase().exec(payload as CreatePurchaseRequestMetadataInput, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create purchase request metadata.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:purchase-request-metadata:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:purchase-request-metadata:create:create"]);
