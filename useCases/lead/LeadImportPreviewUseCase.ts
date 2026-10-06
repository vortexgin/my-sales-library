import { Op } from "sequelize";
import LeadModelFactory, { LeadModel, type CreateLeadInput } from "@/app/sales/models/LeadModel";
import UserModelFactory, { UserModel } from "@/app/base/models/UserModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import {
  leadImportEnvelopeSchema,
  leadImportRowSchema,
  normalizeImportRow,
  toCreateLeadInput,
  type LeadImportRow,
} from "@/app/sales/libraries/leadImportRow";

export type ImportRowIssue = {
  index: number;
  email?: string;
  errors?: string;
};

export type ImportPreview = {
  /** Normalized rows that would be created. */
  new: Array<{ index: number; row: CreateLeadInput }>;
  duplicates_in_file: ImportRowIssue[];
  existing_emails: ImportRowIssue[];
  invalid: ImportRowIssue[];
};

export type ClassifiedImportRows = {
  valid: Array<{ index: number; row: CreateLeadInput }>;
  preview: ImportPreview;
  /** Indexes of rows rejected only because the assignee is unknown. */
  assigneeNotFound: Set<number>;
};

/** A row that passed Joi: required fields are present. */
type ValidatedImportRow = LeadImportRow & {
  name: string;
  email: string;
  phone_number: string;
};

/**
 * Shared classifier: Joi per row (errors collected, never thrown),
 * in-file email duplicates (first occurrence wins, case-insensitive),
 * existing emails (single IN query), unknown assignees.
 */
export async function classifyImportRows(rawRows: unknown[]): Promise<ClassifiedImportRows> {
  const normalized = rawRows.map((raw) =>
    normalizeImportRow((raw ?? {}) as Record<string, unknown>),
  );

  const valid: Array<{ index: number; row: CreateLeadInput }> = [];
  const invalid: ImportRowIssue[] = [];
  const candidates: Array<{ index: number; row: ValidatedImportRow }> = [];

  normalized.forEach((row, index) => {
    const { error, value } = leadImportRowSchema.validate(row, { abortEarly: false });
    if (error) {
      invalid.push({ index, errors: error.details.map((detail) => detail.message).join(", ") });
      return;
    }
    candidates.push({ index, row: value as ValidatedImportRow });
  });

  // In-file duplicates (case-insensitive): first occurrence wins.
  const seen = new Set<string>();
  const duplicates_in_file: ImportRowIssue[] = [];
  const deduped = candidates.filter(({ index, row }) => {
    const email = row.email?.trim().toLowerCase() ?? "";
    if (seen.has(email)) {
      duplicates_in_file.push({ index, email });
      return false;
    }
    seen.add(email);
    return true;
  });

  // Existing emails: one query for the whole batch.
  const existing_emails: ImportRowIssue[] = [];
  let fresh = deduped;
  if (deduped.length > 0) {
    await LeadModelFactory();
    const taken = await LeadModel.findAll({
      where: { email: { [Op.in]: deduped.map(({ row }) => row.email?.trim().toLowerCase()) } },
      attributes: ["email"],
    });
    const takenSet = new Set(taken.map((lead) => lead.email.toLowerCase()));
    fresh = deduped.filter(({ index, row }) => {
      if (takenSet.has(row.email?.trim().toLowerCase() ?? "")) {
        existing_emails.push({ index, email: row.email });
        return false;
      }
      return true;
    });
  }

  // Unknown assignees: one query for the whole batch. Only membership is
  // needed — the assignee label resolves at read time via the association.
  const assigneeIds = [...new Set(fresh.map(({ row }) => row.assigned_to).filter((id): id is string => typeof id === "string"))];
  let knownAssignees = new Set<string>();
  if (assigneeIds.length > 0) {
    await UserModelFactory();
    const users = await UserModel.findAll({
      where: { uuid: { [Op.in]: assigneeIds }, deleted_at: null },
      attributes: ["uuid"],
    });
    knownAssignees = new Set(users.map((user) => user.uuid));
  }
  const assigneeNotFound = new Set<number>();
  for (const { index, row } of fresh) {
    if (row.assigned_to && !knownAssignees.has(row.assigned_to)) {
      invalid.push({ index, email: row.email, errors: "Assigned user not found." });
      assigneeNotFound.add(index);
    } else {
      valid.push({ index, row: toCreateLeadInput(row) });
    }
  }

  return {
    valid,
    preview: {
      new: valid.map(({ index, row }) => ({ index, row })),
      duplicates_in_file,
      existing_emails,
      invalid,
    },
    assigneeNotFound,
  };
}

export class LeadImportPreviewUseCase extends BaseUseCase<{ rows: unknown[] }, ImportPreview, { rows: unknown[] }> {
  protected async preExec(input: { rows: unknown[] }): Promise<{ rows: unknown[] }> {
    const validated = await this.validate<{ rows: unknown[] }>(leadImportEnvelopeSchema, input ?? {});
    return { rows: validated.rows };
  }

  protected async execute(context: { rows: unknown[] }): Promise<ImportPreview> {
    // Dry run: classification only, no writes, no billing.
    return (await classifyImportRows(context.rows)).preview;
  }
}
