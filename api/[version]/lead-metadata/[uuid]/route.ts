import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { LeadMetadataDeleteUseCase } from "@/app/sales/useCases/leadMetadata/LeadMetadataDeleteUseCase";
import { LeadMetadataGetUseCase } from "@/app/sales/useCases/leadMetadata/LeadMetadataGetUseCase";
import { LeadMetadataUpdateUseCase } from "@/app/sales/useCases/leadMetadata/LeadMetadataUpdateUseCase";
import type { UpdateLeadMetadataInput } from "@/app/sales/models/LeadMetadataModel";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new LeadMetadataGetUseCase().exec(uuid);

    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch lead metadata.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as UpdateLeadMetadataInput;

    const row = await new LeadMetadataUpdateUseCase().exec(uuid, payload, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update lead metadata.", getErrorStatus(error, 400));
  }
}

async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new LeadMetadataDeleteUseCase().exec(uuid, await actorFromRequest(request));

    return ok({ message: "Lead metadata deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete lead metadata.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["sales:lead-metadata:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "sales:lead-metadata:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["sales:lead-metadata:view:delete"]);
