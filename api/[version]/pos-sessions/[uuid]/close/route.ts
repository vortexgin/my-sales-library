import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { PosSessionCloseUseCase } from "@/app/sales/useCases/posSession/PosSessionCloseUseCase";
import type { ClosePosSessionInput } from "@/app/sales/models/PosSessionModel";

export const runtime = "nodejs";

async function handlePost(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const payload = (await request.json()) as Partial<ClosePosSessionInput>;

    // organization_id always resolves from the actor; a payload key is
    // rejected instead of silently ignored.
    if (payload !== null && typeof payload === "object" && "organization_id" in payload) {
      return fail("organization_id is not allowed.", 400);
    }

    const row = await new PosSessionCloseUseCase().exec(
      uuid,
      {
        closing_cash: payload.closing_cash ?? null,
        closing_note: payload.closing_note ?? null,
        force: payload.force ?? false,
      },
      await actorFromRequest(request),
    );
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to close POS session.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["sales:pos-session:view:close"]);
