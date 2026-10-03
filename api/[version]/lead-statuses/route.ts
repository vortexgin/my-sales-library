import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { LeadStatusCreateUseCase } from "@/app/sales/useCases/leadStatus/LeadStatusCreateUseCase";
import { LeadStatusListUseCase } from "@/app/sales/useCases/leadStatus/LeadStatusListUseCase";
import type { CreateLeadStatusInput } from "@/app/sales/models/LeadStatusModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new LeadStatusListUseCase().exec(
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
    return fail(error.message ?? "Failed to fetch lead statuses.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreateLeadStatusInput>;

    const row = await new LeadStatusCreateUseCase().exec(payload as CreateLeadStatusInput, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create lead status.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:lead-status:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:lead-status:create:create"]);
