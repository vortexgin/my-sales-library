import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { CustomerDeleteUseCase } from "@/app/sales/useCases/customer/CustomerDeleteUseCase";
import { CustomerGetUseCase } from "@/app/sales/useCases/customer/CustomerGetUseCase";
import { CustomerUpdateUseCase } from "@/app/sales/useCases/customer/CustomerUpdateUseCase";
import type { UpdateCustomerInput } from "@/app/sales/models/CustomerModel";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new CustomerGetUseCase().exec(uuid);

    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch customer.", getErrorStatus(error, 500));
  }
}

async function handlePut(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as UpdateCustomerInput;

    const row = await new CustomerUpdateUseCase().exec(uuid, payload, await actorFromRequest(request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to update customer.", getErrorStatus(error, 400));
  }
}

async function handleDelete(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    await new CustomerDeleteUseCase().exec(uuid, await actorFromRequest(request));

    return ok({ message: "Customer deleted successfully." });
  } catch (error: any) {
    return fail(error.message ?? "Failed to delete customer.", getErrorStatus(error, 400));
  }
}

export const GET = withAuthorization(handleGet, ["sales:customer:view:detail"]);
export const PUT = withAuthorization(handlePut, ["authorized", "sales:customer:view:update"]);
export const DELETE = withAuthorization(handleDelete, ["sales:customer:view:delete"]);
