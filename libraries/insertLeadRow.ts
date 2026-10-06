import { randomUUID } from "crypto";
import LeadModelFactory, {
  LeadModel,
  type CreateLeadInput,
  type Lead,
} from "@/app/sales/models/LeadModel";

/**
 * Single-row insert shared by single create and bulk import: identical field
 * normalization (trim, lowercase email, null defaults, actor org id).
 * The assignee label is resolved at read time via the eager-loaded user
 * association — the write path stores only the `assigned_to` FK.
 */
export async function insertLeadRow(
  input: CreateLeadInput,
  organizationId: string | null,
): Promise<Lead> {
  await LeadModelFactory();
  const lead = await LeadModel.create({
    uuid: randomUUID(),
    name: input.name?.trim(),
    email: input.email?.trim().toLowerCase(),
    phone_number: input.phone_number?.trim(),
    company: input.company?.trim() || null,
    source: input.source ?? "website",
    status: input.status ?? "new",
    value: typeof input.value === "number" ? input.value : null,
    assigned_to: input.assigned_to ?? null,
    organization_id: organizationId ?? null,
    notes: input.notes?.trim() || null,
    deleted_at: null,
  });

  return LeadModel.toApi(lead.toJSON());
}
