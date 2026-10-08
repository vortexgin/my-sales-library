import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { collectFilters, fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { CustomerMetadataCreateUseCase } from "@/app/sales/useCases/customerMetadata/CustomerMetadataCreateUseCase";
import { CustomerMetadataListUseCase } from "@/app/sales/useCases/customerMetadata/CustomerMetadataListUseCase";
import type { CreateCustomerMetadataInput } from "@/app/sales/models/CustomerMetadataModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new CustomerMetadataListUseCase().exec({
      filter: collectFilters(params),
      sortProperty: queryParam(params, "sortProperty"),
      sortDirection: queryParam(params, "sortDirection"),
      offset: queryParam(params, "offset"),
      limit: queryParam(params, "limit"),
    });
    return ok(rows);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch customer metadata.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreateCustomerMetadataInput>;

    const row = await new CustomerMetadataCreateUseCase().exec(payload as CreateCustomerMetadataInput, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create customer metadata.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:customer-metadata:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:customer-metadata:create:create"]);
