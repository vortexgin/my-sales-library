import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { CustomerMetadataFieldDeleteUseCase } from "@/app/sales/useCases/customerMetadataField/CustomerMetadataFieldDeleteUseCase";
import { CustomerMetadataFieldGetUseCase } from "@/app/sales/useCases/customerMetadataField/CustomerMetadataFieldGetUseCase";
import { CustomerMetadataFieldUpdateUseCase } from "@/app/sales/useCases/customerMetadataField/CustomerMetadataFieldUpdateUseCase";
import type { UpdateCustomerMetadataFieldInput } from "@/app/sales/models/CustomerMetadataFieldModel";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new CustomerMetadataFieldGetUseCase().exec(uuid);

    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch customer metadata field.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as UpdateCustomerMetadataFieldInput;

    const row = await new CustomerMetadataFieldUpdateUseCase().exec(uuid, payload, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update customer metadata field.", getErrorStatus(error, 400));
  }
}

async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new CustomerMetadataFieldDeleteUseCase().exec(uuid, await actorFromRequest(request));

    return ok({ message: "Customer metadata field deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete customer metadata field.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["sales:customer-metadata-field:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "sales:customer-metadata-field:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["sales:customer-metadata-field:view:delete"]);
