import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { LeadConvertUseCase } from "@/app/sales/useCases/customer/LeadConvertUseCase";

export const runtime = "nodejs";

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as { lead_id?: string };

    const result = await new LeadConvertUseCase().exec({ lead_id: payload.lead_id ?? "" }, await actorFromRequest(request));
    return ok(result, result.already_existed ? 200 : 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to convert lead.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["sales:customer:create:create"]);
