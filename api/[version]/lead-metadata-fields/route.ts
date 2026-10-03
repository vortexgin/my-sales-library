import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { LeadMetadataFieldCreateUseCase } from "@/app/sales/useCases/leadMetadataField/LeadMetadataFieldCreateUseCase";
import { LeadMetadataFieldListUseCase } from "@/app/sales/useCases/leadMetadataField/LeadMetadataFieldListUseCase";
import type { CreateLeadMetadataFieldInput } from "@/app/sales/models/LeadMetadataFieldModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new LeadMetadataFieldListUseCase().exec(
      {
        filter: {
          q: queryParam(params, "filter[q]"),
          name: queryParam(params, "filter[name]"),
          status: queryParam(params, "filter[status]"),
        },
        sortProperty: queryParam(params, "sortProperty"),
        sortDirection: queryParam(params, "sortDirection"),
        offset: queryParam(params, "offset"),
        limit: queryParam(params, "limit"),
      },
      await actorFromRequest(request),
    );
    return ok(rows);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch lead metadata fields.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreateLeadMetadataFieldInput>;

    const row = await new LeadMetadataFieldCreateUseCase().exec(payload as CreateLeadMetadataFieldInput, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create lead metadata field.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:lead-metadata-field:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:lead-metadata-field:create:create"]);
