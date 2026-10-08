import CustomerModelFactory, { CustomerModel } from "@/app/sales/models/CustomerModel";

/** Batch-resolves customer names (one query); missing rows degrade to absent keys. */
export async function customerNameById(customerIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(customerIds.filter(Boolean))];
  if (ids.length === 0) {
    return new Map();
  }
  try {
    await CustomerModelFactory();
    const rows = await CustomerModel.findAll({ where: { uuid: ids } });
    return new Map(rows.map((row) => [row.uuid, row.name]));
  } catch {
    return new Map();
  }
}
