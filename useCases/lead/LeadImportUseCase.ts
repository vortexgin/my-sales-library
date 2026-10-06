import { UniqueConstraintError } from "sequelize";
import type { Lead } from "@/app/sales/models/LeadModel";
import { UserModel } from "@/app/base/models/UserModel";
import type { ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import { checkTransaction, settleTransaction, type TransactionBilling } from "@/useCases/TransactionUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";
import { insertLeadRow } from "@/app/sales/libraries/insertLeadRow";
import {
  classifyImportRows,
} from "@/app/sales/useCases/lead/LeadImportPreviewUseCase";
import { leadImportEnvelopeSchema } from "@/app/sales/libraries/leadImportRow";

export type ImportSkipped = {
  index: number;
  email?: string;
  reason: "duplicate" | "validation" | "assignee-not-found";
};

export type LeadImportResult = {
  created: Lead[];
  skipped: ImportSkipped[];
};

export type LeadImportContext = {
  valid: Array<{ index: number; row: Parameters<typeof insertLeadRow>[0] }>;
  actor: ActivityActor;
  organizationId: string | null;
  skipped: ImportSkipped[];
} & TransactionBilling;

export class LeadImportUseCase extends BaseUseCase<{ rows: unknown[] }, LeadImportResult, LeadImportContext> {
  protected async preExec(input: { rows: unknown[] }, actor?: ActivityActor): Promise<LeadImportContext> {
    const billing = await checkTransaction(actor, "sales:lead:create:create");

    const validated = await this.validate<{ rows: unknown[] }>(leadImportEnvelopeSchema, input ?? {});

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    const { valid, preview, assigneeNotFound } = await classifyImportRows(validated.rows);

    const skipped: ImportSkipped[] = [
      ...preview.duplicates_in_file.map(({ index, email }) => ({ index, email, reason: "duplicate" as const })),
      ...preview.existing_emails.map(({ index, email }) => ({ index, email, reason: "duplicate" as const })),
      ...preview.invalid.map(({ index, email }) => ({
        index,
        email,
        reason: (assigneeNotFound.has(index) ? "assignee-not-found" : "validation") as ImportSkipped["reason"],
      })),
    ];

    return {
      valid: valid.map(({ index, row }) => ({ index, row })),
      actor: actor ?? null,
      organizationId,
      skipped,
      ...billing,
    };
  }

  protected async execute(context: LeadImportContext): Promise<LeadImportResult> {
    const { valid, organizationId } = context;
    const created: Lead[] = [];
    const skipped: ImportSkipped[] = [...context.skipped];

    for (const { index, row } of valid) {
      try {
        created.push(await insertLeadRow(row, organizationId));
      } catch (error) {
        // Race safety net: a concurrent insert won between classification
        // and here. Never abort the batch.
        if (error instanceof DuplicateEntityException || error instanceof UniqueConstraintError) {
          skipped.push({ index, email: row.email, reason: "duplicate" });
          continue;
        }
        throw error;
      }
    }

    return { created, skipped };
  }

  protected async postExec(result: LeadImportResult, context?: LeadImportContext): Promise<LeadImportResult> {
    // Quota consumed only for created rows; preview/skipped cost nothing.
    for (const lead of result.created) {
      await settleTransaction({
        actor: context?.actor ?? null,
        operation: "create",
        entity: "lead",
        entity_uuid: lead.uuid,
        origin: null,
        updated: lead,
        billing: context ?? null,
      });
    }
    return super.postExec(result, context);
  }
}
