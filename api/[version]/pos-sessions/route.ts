import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { collectFilters, fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { PosSessionListUseCase } from "@/app/sales/useCases/posSession/PosSessionListUseCase";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new PosSessionListUseCase().exec(
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
    return fail(error.message ?? "Failed to fetch POS sessions.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:pos-session:list:list"]);
