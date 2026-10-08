import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { collectFilters, fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { SalesOrderMetadataCreateUseCase } from "@/app/sales/useCases/salesOrderMetadata/SalesOrderMetadataCreateUseCase";
import { SalesOrderMetadataListUseCase } from "@/app/sales/useCases/salesOrderMetadata/SalesOrderMetadataListUseCase";
import type { CreateSalesOrderMetadataInput } from "@/app/sales/models/SalesOrderMetadataModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new SalesOrderMetadataListUseCase().exec({
      filter: collectFilters(params),
      sortProperty: queryParam(params, "sortProperty"),
      sortDirection: queryParam(params, "sortDirection"),
      offset: queryParam(params, "offset"),
      limit: queryParam(params, "limit"),
    }, await actorFromRequest(request));
    return ok(rows);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch sales order metadata.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as CreateSalesOrderMetadataInput;
    const row = await new SalesOrderMetadataCreateUseCase().exec(payload, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create sales order metadata.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:sales-order-metadata:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:sales-order-metadata:create:create"]);
