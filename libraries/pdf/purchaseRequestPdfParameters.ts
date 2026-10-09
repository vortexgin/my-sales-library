import type { PurchaseRequest } from "@/app/sales/models/PurchaseRequestModel";
import { formatMoney } from "@/libraries/Currency";
import { formatPdfDate, type ValidatedPdfRequest } from "@/libraries/google/PdfRequest";
import { generatedParameters } from "@/libraries/google/PdfGeneration";

export function purchaseRequestPdfParameters(request: PurchaseRequest, options: ValidatedPdfRequest & { actorName: string; organizationName: string }) {
  return {
    ...generatedParameters({ ...options, organizationId: request.organization_id }),
    document: { uuid: request.uuid, number: request.doc_number ?? request.uuid, type: "PR", status: request.status, created_at: request.created_at, created_date: formatPdfDate(request.created_at, options.locale, options.timezone) },
    customer: { id: request.customer_id, name: request.customer?.name ?? request.customer_id },
    warehouse: { id: request.warehouse_id ?? "—", code: request.warehouse?.code ?? "—", name: request.warehouse?.name ?? request.warehouse_id ?? "—" },
    totals: { subtotal: formatMoney(request.subtotal), discount_pct: String(request.discount_pct), grand_total: formatMoney(request.grand_total) },
    notes: request.notes ?? "—",
    items: (request.items ?? []).map((item) => ({ product_id: item.product_id, product_sku: item.product_sku ?? "—", product_name: item.product_name ?? item.product_id, variant_id: item.variant_id ?? "—", variant_sku: item.variant_sku ?? "—", variant_name: item.variant_name ?? item.variant_id ?? "—", qty: item.qty, unit_price: formatMoney(item.unit_price), discount_pct: item.discount_pct, line_total: formatMoney(item.line_total), notes: item.notes ?? "—" })),
    metadata: (request.metadata ?? []).map((item) => ({ name: item.field_name ?? item.sales_doc_metadata_field_id, value: item.value })),
  };
}
