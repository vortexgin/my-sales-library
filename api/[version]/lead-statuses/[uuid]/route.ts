import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { LeadStatusDeleteUseCase } from "@/app/sales/useCases/leadStatus/LeadStatusDeleteUseCase";
import { LeadStatusGetUseCase } from "@/app/sales/useCases/leadStatus/LeadStatusGetUseCase";
import { LeadStatusUpdateUseCase } from "@/app/sales/useCases/leadStatus/LeadStatusUpdateUseCase";
import type { UpdateLeadStatusInput } from "@/app/sales/models/LeadStatusModel";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new LeadStatusGetUseCase().exec(uuid);

    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch lead status.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as UpdateLeadStatusInput;

    const row = await new LeadStatusUpdateUseCase().exec(uuid, payload, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update lead status.", getErrorStatus(error, 400));
  }
}

async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new LeadStatusDeleteUseCase().exec(uuid, await actorFromRequest(request));

    return ok({ message: "Lead status deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete lead status.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["sales:lead-status:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "sales:lead-status:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["sales:lead-status:view:delete"]);
