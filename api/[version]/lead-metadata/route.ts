import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { LeadMetadataCreateUseCase } from "@/app/sales/useCases/leadMetadata/LeadMetadataCreateUseCase";
import { LeadMetadataListUseCase } from "@/app/sales/useCases/leadMetadata/LeadMetadataListUseCase";
import type { CreateLeadMetadataInput } from "@/app/sales/models/LeadMetadataModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new LeadMetadataListUseCase().exec({
      filter: {
        q: queryParam(params, "filter[q]"),
        leads_id: queryParam(params, "filter[leads_id]"),
        lead_metadata_field_id:
          queryParam(params, "filter[lead_metadata_field_id]") ?? queryParam(params, "filter[name]"),
        status: queryParam(params, "filter[status]"),
      },
      sortProperty: queryParam(params, "sortProperty"),
      sortDirection: queryParam(params, "sortDirection"),
      offset: queryParam(params, "offset"),
      limit: queryParam(params, "limit"),
    });
    return ok(rows);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch lead metadata.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreateLeadMetadataInput>;

    const row = await new LeadMetadataCreateUseCase().exec(payload as CreateLeadMetadataInput, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create lead metadata.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:lead-metadata:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:lead-metadata:create:create"]);
