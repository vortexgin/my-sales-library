import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { collectFilters, fail, getErrorStatus, ok, queryParam } from "@/libraries/Http";
import { PosTransactionListUseCase } from "@/app/sales/useCases/posTransaction/PosTransactionListUseCase";
import { PosTransactionCreateUseCase } from "@/app/sales/useCases/posTransaction/PosTransactionCreateUseCase";
import type { CreatePosTransactionInput } from "@/app/sales/models/PosTransactionModel";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  try {
    await connectDatabase();
    const params = request.nextUrl.searchParams;
    const rows = await new PosTransactionListUseCase().exec(
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
    return fail(error.message ?? "Failed to fetch POS transactions.", getErrorStatus(error, 500));
  }
}

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<CreatePosTransactionInput>;

    // organization_id always resolves from the actor; a payload key is
    // rejected instead of silently ignored.
    if (payload !== null && typeof payload === "object" && "organization_id" in payload) {
      return fail("organization_id is not allowed.", 400);
    }

    const row = await new PosTransactionCreateUseCase().exec(
      {
        session_id: payload.session_id as string,
        customer_id: payload.customer_id ?? null,
        warehouse_id: payload.warehouse_id as string,
        payment_method: payload.payment_method as CreatePosTransactionInput["payment_method"],
        ...(payload.card_last_four !== undefined ? { card_last_four: payload.card_last_four } : {}),
        tendered: payload.tendered ?? null,
        discount_pct: payload.discount_pct ?? 0,
        tax_pct: payload.tax_pct ?? 10,
        fulfillment: payload.fulfillment ?? "system",
        items: payload.items ?? [],
      },
      await actorFromRequest(request),
    );
    return ok(row, 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to complete POS sale.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:pos-transaction:list:list"]);
export const POST = withAuthorization(handlePost, ["sales:pos-transaction:create:create"]);
