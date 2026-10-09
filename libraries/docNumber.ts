import { getSequelizeInstance } from "@/database/sequelize";

export type SalesDocType = "PR" | "SO" | "DO" | "POS";

const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** Formats {PR|SO|DO}/YYYY/{roman MM}/{5-digit seq}. */
export function formatDocNumber(type: SalesDocType, at: Date, seq: number): string {
  const year = at.getUTCFullYear();
  const roman = ROMAN_MONTHS[at.getUTCMonth()] ?? "I";
  return `${type}/${year}/${roman}/${String(seq).padStart(5, "0")}`;
}

/**
 * Next document number for (organization, type, current month). Atomic:
 * bare INSERT ... ON CONFLICT DO NOTHING (unique index is NULLS NOT
 * DISTINCT) followed by an atomic UPDATE ... RETURNING, so concurrent
 * creates serialize on the sequence row and never reuse a number.
 */
export async function nextDocNumber(
  type: SalesDocType,
  organizationId: string | null,
  at: Date = new Date(),
): Promise<string> {
  const sequelize = await getSequelizeInstance();
  const yearMonth = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
  await sequelize.query(
    `INSERT INTO sales_doc_sequences (uuid, organization_id, doc_type, year_month, last_number, created_at, updated_at)
     VALUES (gen_random_uuid(), :organizationId, :docType, :yearMonth, 0, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    { replacements: { organizationId, docType: type, yearMonth } },
  );
  const [rows] = (await sequelize.query(
    `UPDATE sales_doc_sequences SET last_number = last_number + 1, updated_at = NOW()
     WHERE organization_id IS NOT DISTINCT FROM :organizationId
       AND doc_type = :docType AND year_month = :yearMonth
     RETURNING last_number`,
    { replacements: { organizationId, docType: type, yearMonth } },
  )) as unknown as Array<{ last_number: number }>[];
  const seq = Array.isArray(rows) ? rows[0]?.last_number : (rows as unknown as { last_number: number })?.last_number;
  if (typeof seq !== "number") {
    throw new Error("Failed to allocate document number.");
  }
  return formatDocNumber(type, at, seq);
}
