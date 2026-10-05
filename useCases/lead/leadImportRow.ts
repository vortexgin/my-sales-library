import Joi from "joi";
import type { CreateLeadInput } from "@/app/sales/models/LeadModel";

/** One CSV-parsed row. Empty strings are normalized to undefined before validation. */
export type LeadImportRow = {
  name?: string;
  email?: string;
  phone_number?: string;
  company?: string | null;
  source?: string;
  status?: string;
  value?: number | null;
  assigned_to?: string | null;
  notes?: string | null;
};

export const MAX_IMPORT_ROWS = 500;

/** Shared per-row rules — same shape as single-create, no fork. */
export const leadImportRowSchema = Joi.object({
  name: Joi.string().trim().min(2).required(),
  email: Joi.string().trim().email().required(),
  phone_number: Joi.string().trim().min(6).required(),
  company: Joi.string().trim().allow("", null).max(160).optional(),
  source: Joi.string().valid("website", "referral", "ads", "cold_call", "event", "other").optional(),
  status: Joi.string().trim().min(2).max(60).optional(),
  value: Joi.number().integer().min(0).allow(null).optional(),
  assigned_to: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  notes: Joi.string().trim().allow("", null).optional(),
}).unknown(false);

export const leadImportEnvelopeSchema = Joi.object({
  rows: Joi.array().items(Joi.object().unknown(true)).min(1).max(MAX_IMPORT_ROWS).required(),
}).unknown(false);

/** Trims values; empty strings become undefined so optional UUID/number fields validate. */
export function normalizeImportRow(raw: Record<string, unknown>): LeadImportRow {
  const row: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw ?? {})) {
    if (typeof val === "string") {
      const trimmed = val.trim();
      row[key] = trimmed === "" ? undefined : trimmed;
    } else {
      row[key] = val;
    }
  }
  return row as LeadImportRow;
}

/** Field normalization shared with single create (trim, lowercase email, null defaults). */
export function toCreateLeadInput(row: LeadImportRow): CreateLeadInput {
  return {
    name: row.name?.trim() ?? "",
    email: row.email?.trim().toLowerCase() ?? "",
    phone_number: row.phone_number?.trim() ?? "",
    company: row.company?.trim() || null,
    source: (row.source as CreateLeadInput["source"]) ?? "website",
    status: row.status?.trim() || "new",
    value: typeof row.value === "number" ? row.value : null,
    assigned_to: row.assigned_to ?? null,
    notes: row.notes?.trim() || null,
  } as CreateLeadInput;
}
