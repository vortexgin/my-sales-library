import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { GenerateSalesOrderPdfUseCase } from "@/app/sales/useCases/salesOrder/GenerateSalesOrderPdfUseCase";

export const runtime = "nodejs";
async function handlePost(request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  try { await connectDatabase(); return ok(await new GenerateSalesOrderPdfUseCase().exec((await params).uuid, await request.json(), await actorFromRequest(request))); }
  catch (error: any) { return fail(error.message ?? "Failed to generate sales order PDF.", getErrorStatus(error, 500)); }
}
export const POST = withAuthorization(handlePost, ["sales:sales-order:view:detail"]);
