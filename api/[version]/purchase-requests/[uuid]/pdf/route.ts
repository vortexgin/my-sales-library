import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { GeneratePurchaseRequestPdfUseCase } from "@/app/sales/useCases/purchaseRequest/GeneratePurchaseRequestPdfUseCase";

export const runtime = "nodejs";
async function handlePost(request: NextRequest, { params }: { params: Promise<{ uuid: string }> }) {
  try { await connectDatabase(); return ok(await new GeneratePurchaseRequestPdfUseCase().exec((await params).uuid, await request.json(), await actorFromRequest(request))); }
  catch (error: any) { return fail(error.message ?? "Failed to generate purchase request PDF.", getErrorStatus(error, 500)); }
}
export const POST = withAuthorization(handlePost, ["sales:purchase-request:view:detail"]);
