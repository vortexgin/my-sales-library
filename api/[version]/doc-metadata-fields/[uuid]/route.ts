import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { DocMetadataFieldDeleteUseCase } from "@/app/sales/useCases/docMetadataField/DocMetadataFieldDeleteUseCase";
import { DocMetadataFieldGetUseCase } from "@/app/sales/useCases/docMetadataField/DocMetadataFieldGetUseCase";
import { DocMetadataFieldUpdateUseCase } from "@/app/sales/useCases/docMetadataField/DocMetadataFieldUpdateUseCase";
import type { UpdateDocMetadataFieldInput } from "@/app/sales/models/DocMetadataFieldModel";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new DocMetadataFieldGetUseCase().exec(uuid);

    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch doc metadata field.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as UpdateDocMetadataFieldInput;

    const row = await new DocMetadataFieldUpdateUseCase().exec(uuid, payload, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update doc metadata field.", getErrorStatus(error, 400));
  }
}

async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new DocMetadataFieldDeleteUseCase().exec(uuid, await actorFromRequest(request));

    return ok({ message: "Doc metadata field deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete doc metadata field.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["sales:doc-metadata-field:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "sales:doc-metadata-field:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["sales:doc-metadata-field:view:delete"]);
