import { NextRequest } from "next/server";
import { connectDatabase } from "@/database/sequelize";
import { withAuthorization } from "@/libraries/AuthorizedRoute";
import { fail, getErrorStatus, ok } from "@/libraries/Http";
import { LeadImportPreviewUseCase } from "@/app/sales/useCases/lead/LeadImportPreviewUseCase";

export const runtime = "nodejs";

async function handlePost(request: NextRequest) {
  try {
    await connectDatabase();
    const payload = (await request.json()) as { rows: unknown[] };

    // Dry run: classification only, no writes, no credit consumed.
    const preview = await new LeadImportPreviewUseCase().exec(payload);
    return ok(preview);
  } catch (error: any) {
    return fail(error.message ?? "Failed to preview lead import.", getErrorStatus(error, 500));
  }
}

export const POST = withAuthorization(handlePost, ["sales:lead:list:list"]);
