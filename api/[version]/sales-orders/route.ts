import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { collectFilters, fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { SalesOrderCreateUseCase } from "@/app/sales/useCases/salesOrder/SalesOrderCreateUseCase";
import { SalesOrderListUseCase } from "@/app/sales/useCases/salesOrder/SalesOrderListUseCase";
import type { CreateSalesOrderInput } from "@/app/sales/models/SalesOrderModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new SalesOrderListUseCase().exec(
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
    return fail(error.message ?? "Failed to fetch sales orders.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreateSalesOrderInput>;

    const row = await new SalesOrderCreateUseCase().exec(payload as CreateSalesOrderInput, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create sales order.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:sales-order:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:sales-order:create:create"]);
