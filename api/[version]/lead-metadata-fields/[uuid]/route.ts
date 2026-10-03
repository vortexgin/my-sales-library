import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { LeadMetadataFieldDeleteUseCase } from "@/app/sales/useCases/leadMetadataField/LeadMetadataFieldDeleteUseCase";
import { LeadMetadataFieldGetUseCase } from "@/app/sales/useCases/leadMetadataField/LeadMetadataFieldGetUseCase";
import { LeadMetadataFieldUpdateUseCase } from "@/app/sales/useCases/leadMetadataField/LeadMetadataFieldUpdateUseCase";
import type { UpdateLeadMetadataFieldInput } from "@/app/sales/models/LeadMetadataFieldModel";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new LeadMetadataFieldGetUseCase().exec(uuid);

    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch lead metadata field.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as UpdateLeadMetadataFieldInput;

    const row = await new LeadMetadataFieldUpdateUseCase().exec(uuid, payload, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update lead metadata field.", getErrorStatus(error, 400));
  }
}

async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new LeadMetadataFieldDeleteUseCase().exec(uuid, await actorFromRequest(request));

    return ok({ message: "Lead metadata field deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete lead metadata field.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["sales:lead-metadata-field:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "sales:lead-metadata-field:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["sales:lead-metadata-field:view:delete"]);
