import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { collectFilters, fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { CustomerActivityCreateUseCase } from "@/app/sales/useCases/customerActivity/CustomerActivityCreateUseCase";
import { CustomerActivityListUseCase } from "@/app/sales/useCases/customerActivity/CustomerActivityListUseCase";
import type { CreateCustomerActivityInput } from "@/app/sales/models/CustomerActivityModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new CustomerActivityListUseCase().exec(
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
    return fail(error.message ?? "Failed to fetch customer activities.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreateCustomerActivityInput>;

    const row = await new CustomerActivityCreateUseCase().exec(payload as CreateCustomerActivityInput, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create customer activity.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:customer-activity:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:customer-activity:create:create"]);
