import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { LeadImportUseCase } from "@/app/sales/useCases/lead/LeadImportUseCase";

export const runtime = "nodejs";

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as { rows: unknown[] };

    const result = await new LeadImportUseCase().exec(payload, await actorFromRequest(request));
    return ok(result, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to import leads.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["sales:lead:create:create"]);
