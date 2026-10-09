import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { actorFromRequest } from "@/libraries/Auth";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { PosSessionGetUseCase } from "@/app/sales/useCases/posSession/PosSessionGetUseCase";

export const runtime = "nodejs";

async function handleGet(
  _request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  try {
    await connectDatabase();
    const { uuid } = await params;
    const row = await new PosSessionGetUseCase().exec(uuid, await actorFromRequest(_request));
    return ok(row);
  } catch (error: any) {
    return fail(error.message ?? "Failed to fetch POS session.", getErrorStatus(error, 500));
  }
}

export const GET = withAuthorization(handleGet, ["sales:pos-session:view:detail"]);
