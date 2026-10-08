import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { SalesOrderMetadataDeleteUseCase } from "@/app/sales/useCases/salesOrderMetadata/SalesOrderMetadataDeleteUseCase";
import { SalesOrderMetadataGetUseCase } from "@/app/sales/useCases/salesOrderMetadata/SalesOrderMetadataGetUseCase";
import { SalesOrderMetadataUpdateUseCase } from "@/app/sales/useCases/salesOrderMetadata/SalesOrderMetadataUpdateUseCase";
import type { UpdateSalesOrderMetadataInput } from "@/app/sales/models/SalesOrderMetadataModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    return ok(await new SalesOrderMetadataGetUseCase().exec(uuid, await actorFromRequest(request)));
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch sales order metadata.", getErrorStatus(error, 500));
  }
}

async function handlePut(request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as UpdateSalesOrderMetadataInput;
    return ok(await new SalesOrderMetadataUpdateUseCase().exec(uuid, payload, await actorFromRequest(request)));
  } catch (error: any) {
    return fail(error.message ?? "Failed to update sales order metadata.", getErrorStatus(error, 400));
  }
}

async function handleDelete(request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new SalesOrderMetadataDeleteUseCase().exec(uuid, await actorFromRequest(request));
    return ok({ message: "Sales order metadata deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete sales order metadata.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["sales:sales-order-metadata:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "sales:sales-order-metadata:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["sales:sales-order-metadata:view:delete"]);
