import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { CustomerMetadataDeleteUseCase } from "@/app/sales/useCases/customerMetadata/CustomerMetadataDeleteUseCase";
import { CustomerMetadataGetUseCase } from "@/app/sales/useCases/customerMetadata/CustomerMetadataGetUseCase";
import { CustomerMetadataUpdateUseCase } from "@/app/sales/useCases/customerMetadata/CustomerMetadataUpdateUseCase";
import type { UpdateCustomerMetadataInput } from "@/app/sales/models/CustomerMetadataModel";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new CustomerMetadataGetUseCase().exec(uuid);

    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch customer metadata.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as UpdateCustomerMetadataInput;

    const row = await new CustomerMetadataUpdateUseCase().exec(uuid, payload, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update customer metadata.", getErrorStatus(error, 400));
  }
}

async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new CustomerMetadataDeleteUseCase().exec(uuid, await actorFromRequest(request));

    return ok({ message: "Customer metadata deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete customer metadata.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["sales:customer-metadata:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "sales:customer-metadata:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["sales:customer-metadata:view:delete"]);
