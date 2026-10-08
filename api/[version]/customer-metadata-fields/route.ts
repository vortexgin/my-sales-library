import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { collectFilters, fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { CustomerMetadataFieldCreateUseCase } from "@/app/sales/useCases/customerMetadataField/CustomerMetadataFieldCreateUseCase";
import { CustomerMetadataFieldListUseCase } from "@/app/sales/useCases/customerMetadataField/CustomerMetadataFieldListUseCase";
import type { CreateCustomerMetadataFieldInput } from "@/app/sales/models/CustomerMetadataFieldModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new CustomerMetadataFieldListUseCase().exec(
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
    return fail(error.message ?? "Failed to fetch customer metadata fields.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreateCustomerMetadataFieldInput>;

    const row = await new CustomerMetadataFieldCreateUseCase().exec(payload as CreateCustomerMetadataFieldInput, await actorFromRequest(request));
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to create customer metadata field.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:customer-metadata-field:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:customer-metadata-field:create:create"]);
