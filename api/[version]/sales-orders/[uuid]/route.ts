import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { SalesOrderDeleteUseCase } from "@/app/sales/useCases/salesOrder/SalesOrderDeleteUseCase";
import { SalesOrderGetUseCase } from "@/app/sales/useCases/salesOrder/SalesOrderGetUseCase";
import { SalesOrderUpdateUseCase } from "@/app/sales/useCases/salesOrder/SalesOrderUpdateUseCase";
import type { UpdateSalesOrderInput } from "@/app/sales/models/SalesOrderModel";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new SalesOrderGetUseCase().exec(uuid);

    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch sales order.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as UpdateSalesOrderInput;

    const row = await new SalesOrderUpdateUseCase().exec(uuid, payload, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update sales order.", getErrorStatus(error, 400));
  }
}

async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new SalesOrderDeleteUseCase().exec(uuid, await actorFromRequest(request));

    return ok({ message: "Sales order deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete sales order.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["sales:sales-order:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "sales:sales-order:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["sales:sales-order:view:delete"]);
