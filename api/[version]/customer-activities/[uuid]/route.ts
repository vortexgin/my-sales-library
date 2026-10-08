import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { CustomerActivityDeleteUseCase } from "@/app/sales/useCases/customerActivity/CustomerActivityDeleteUseCase";
import { CustomerActivityGetUseCase } from "@/app/sales/useCases/customerActivity/CustomerActivityGetUseCase";
import { CustomerActivityUpdateUseCase } from "@/app/sales/useCases/customerActivity/CustomerActivityUpdateUseCase";
import type { UpdateCustomerActivityInput } from "@/app/sales/models/CustomerActivityModel";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new CustomerActivityGetUseCase().exec(uuid);

    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch customer activity.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as UpdateCustomerActivityInput;

    const row = await new CustomerActivityUpdateUseCase().exec(uuid, payload, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update customer activity.", getErrorStatus(error, 400));
  }
}

async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new CustomerActivityDeleteUseCase().exec(uuid, await actorFromRequest(request));

    return ok({ message: "Customer activity deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete customer activity.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["sales:customer-activity:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "sales:customer-activity:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["sales:customer-activity:view:delete"]);
