import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { collectFilters, fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { CustomerCreateUseCase } from "@/app/sales/useCases/customer/CustomerCreateUseCase";
import { CustomerListUseCase } from "@/app/sales/useCases/customer/CustomerListUseCase";
import type { CreateCustomerInput } from "@/app/sales/models/CustomerModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new CustomerListUseCase().exec(
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
    return fail(error.message ?? "Failed to fetch customers.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreateCustomerInput>;

    const row = await new CustomerCreateUseCase().exec(payload as CreateCustomerInput, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create customer.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:customer:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:customer:create:create"]);
