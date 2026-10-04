import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { LeadActivityCreateUseCase } from "@/app/sales/useCases/leadActivity/LeadActivityCreateUseCase";
import { LeadActivityListUseCase } from "@/app/sales/useCases/leadActivity/LeadActivityListUseCase";
import type { CreateLeadActivityInput } from "@/app/sales/models/LeadActivityModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new LeadActivityListUseCase().exec({
      filter: {
        q: queryParam(params, "filter[q]"),
        leads_id: queryParam(params, "filter[leads_id]"),
        status: queryParam(params, "filter[status]"),
      },
      sortProperty: queryParam(params, "sortProperty"),
      sortDirection: queryParam(params, "sortDirection"),
      offset: queryParam(params, "offset"),
      limit: queryParam(params, "limit"),
    });
    return ok(rows);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch lead activities.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreateLeadActivityInput>;

    const row = await new LeadActivityCreateUseCase().exec(payload as CreateLeadActivityInput, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create lead activity.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:lead-activity:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:lead-activity:create:create"]);
