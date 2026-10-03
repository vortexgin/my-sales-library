import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { LeadCreateUseCase } from "@/app/sales/useCases/lead/LeadCreateUseCase";
import { LeadListUseCase } from "@/app/sales/useCases/lead/LeadListUseCase";
import type { CreateLeadInput } from "@/app/sales/models/LeadModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const leads = await new LeadListUseCase().exec(
      {
        filter: {
          q: queryParam(params, "filter[q]"),
          status: queryParam(params, "filter[status]"),
          source: queryParam(params, "filter[source]"),
          assigned_to: queryParam(params, "filter[assigned_to]"),
        },
        sortProperty: queryParam(params, "sortProperty"),
        sortDirection: queryParam(params, "sortDirection"),
        offset: queryParam(params, "offset"),
        limit: queryParam(params, "limit"),
      },
      await actorFromRequest(request),
    );
    return ok(leads);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch leads.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreateLeadInput>;

    const lead = await new LeadCreateUseCase().exec(payload as CreateLeadInput, await actorFromRequest(request));
    return ok(lead, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create lead.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:lead:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:lead:create:create"]);
