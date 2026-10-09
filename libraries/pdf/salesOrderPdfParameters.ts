import type { SalesOrder } from "@/app/sales/models/SalesOrderModel";
import { formatMoney } from "@/libraries/Currency";
import { formatPdfDate, type ValidatedPdfRequest } from "@/libraries/google/PdfRequest";
import { generatedParameters } from "@/libraries/google/PdfGeneration";

export function salesOrderPdfParameters(order: SalesOrder, purchaseRequest: { id: string; number: string; status: string } | null, options: ValidatedPdfRequest & { actorName: string; organizationName: string }) {
  return {
    ...generatedParameters({ ...options, organizationId: order.organization_id }),
    document: { uuid: order.uuid, number: order.doc_number ?? order.uuid, type: "SO", status: order.status, created_at: order.created_at, created_date: formatPdfDate(order.created_at, options.locale, options.timezone) },
    customer: { id: order.customer_id, name: order.customer?.name ?? order.customer_id },
    warehouse: { id: order.warehouse_id ?? "—", code: order.warehouse?.code ?? "—", name: order.warehouse?.name ?? order.warehouse_id ?? "—" },
    purchase_request: purchaseRequest ?? { id: order.purchase_request_id ?? "—", number: "—", status: "—" },
    totals: { subtotal: formatMoney(order.subtotal), discount_pct: String(order.discount_pct), grand_total: formatMoney(order.grand_total) },
    notes: order.notes ?? "—",
    items: (order.items ?? []).map((item) => ({ product_id: item.product_id, product_sku: item.product_sku ?? "—", product_name: item.product_name ?? item.product_id, variant_id: item.variant_id ?? "—", variant_sku: item.variant_sku ?? "—", variant_name: item.variant_name ?? item.variant_id ?? "—", qty: item.qty, unit_price: formatMoney(item.unit_price), discount_pct: item.discount_pct, line_total: formatMoney(item.line_total), notes: item.notes ?? "—" })),
    metadata: (order.metadata ?? []).map((item) => ({ name: item.field_name ?? item.sales_doc_metadata_field_id, value: item.value })),
  };
}
