import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { collectFilters, fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { DocMetadataFieldCreateUseCase } from "@/app/sales/useCases/docMetadataField/DocMetadataFieldCreateUseCase";
import { DocMetadataFieldListUseCase } from "@/app/sales/useCases/docMetadataField/DocMetadataFieldListUseCase";
import type { CreateDocMetadataFieldInput } from "@/app/sales/models/DocMetadataFieldModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new DocMetadataFieldListUseCase().exec(
      {
        filter: collectFilters(params),
        sortProperty: queryParam(params, "sortProperty"),
        sortDirection: queryParam(params, "sortDirection"),
        offset: queryParam(params, "offset"),
        limit: queryParam(params, "limit"),
      },
      await actorFromRequest(request),
    );
    return ok(rows);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch doc metadata fields.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreateDocMetadataFieldInput>;

    const row = await new DocMetadataFieldCreateUseCase().exec(payload as CreateDocMetadataFieldInput, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create doc metadata field.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:doc-metadata-field:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:doc-metadata-field:create:create"]);
