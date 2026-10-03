import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { LeadDeleteUseCase } from "@/app/sales/useCases/lead/LeadDeleteUseCase";
import { LeadGetUseCase } from "@/app/sales/useCases/lead/LeadGetUseCase";
import { LeadUpdateUseCase } from "@/app/sales/useCases/lead/LeadUpdateUseCase";
import type { UpdateLeadInput } from "@/app/sales/models/LeadModel";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const lead = await new LeadGetUseCase().exec(uuid);

    return ok(lead);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch lead.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as UpdateLeadInput;

    const lead = await new LeadUpdateUseCase().exec(uuid, payload, await actorFromRequest(request));
    return ok(lead);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update lead.", getErrorStatus(error, 400));
  }
}

async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new LeadDeleteUseCase().exec(uuid, await actorFromRequest(request));

    return ok({ message: "Lead deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete lead.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["sales:lead:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "sales:lead:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["sales:lead:view:delete"]);
