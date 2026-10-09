import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { PosSessionOpenUseCase } from "@/app/sales/useCases/posSession/PosSessionOpenUseCase";
import type { OpenPosSessionInput } from "@/app/sales/models/PosSessionModel";

export const runtime = "nodejs";

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as Partial<OpenPosSessionInput>;

    // organization_id always resolves from the actor; a payload key is
    // rejected instead of silently ignored.
    if (payload !== null && typeof payload === "object" && "organization_id" in payload) {
      return fail("organization_id is not allowed.", 400);
    }

    const result = await new PosSessionOpenUseCase().exec(
      { opening_cash: payload.opening_cash, notes: payload.notes ?? null },
      await actorFromRequest(request),
    );
    return ok(result, result.already_open ? 200 : 201);
  } catch (error: any) {
    return fail(error.message ?? "Failed to open POS session.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["sales:pos-session:create:create"]);
