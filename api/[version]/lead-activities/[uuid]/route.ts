import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { LeadActivityDeleteUseCase } from "@/app/sales/useCases/leadActivity/LeadActivityDeleteUseCase";
import { LeadActivityGetUseCase } from "@/app/sales/useCases/leadActivity/LeadActivityGetUseCase";
import { LeadActivityUpdateUseCase } from "@/app/sales/useCases/leadActivity/LeadActivityUpdateUseCase";
import type { UpdateLeadActivityInput } from "@/app/sales/models/LeadActivityModel";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new LeadActivityGetUseCase().exec(uuid);

    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch lead activity.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as UpdateLeadActivityInput;

    const row = await new LeadActivityUpdateUseCase().exec(uuid, payload, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update lead activity.", getErrorStatus(error, 400));
  }
}

async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new LeadActivityDeleteUseCase().exec(uuid, await actorFromRequest(request));

    return ok({ message: "Lead activity deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete lead activity.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["sales:lead-activity:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "sales:lead-activity:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["sales:lead-activity:view:delete"]);
