import type { DeliveryOrder } from "@/app/sales/models/DeliveryOrderModel";
import { formatPdfDate, type ValidatedPdfRequest } from "@/libraries/google/PdfRequest";
import { generatedParameters } from "@/libraries/google/PdfGeneration";

export function deliveryOrderPdfParameters(order: DeliveryOrder, relations: { salesOrder: { id: string; number: string; status: string }; customer: { id: string; name: string } }, options: ValidatedPdfRequest & { actorName: string; organizationName: string }) {
  return {
    ...generatedParameters({ ...options, organizationId: order.organization_id }),
    document: { uuid: order.uuid, number: order.doc_number ?? order.uuid, type: "DO", status: order.status, fulfillment: order.fulfillment ?? "—", stock_deducted: order.stock_deducted ? "yes" : "no", created_at: order.created_at, created_date: formatPdfDate(order.created_at, options.locale, options.timezone) },
    sales_order: relations.salesOrder,
    customer: relations.customer,
    warehouse: { id: order.warehouse_id, code: order.warehouse?.code ?? "—", name: order.warehouse?.name ?? order.warehouse_id },
    notes: order.notes ?? "—",
    items: (order.items ?? []).map((item) => ({ product_id: item.product_id, product_sku: item.product_sku ?? "—", product_name: item.product_name ?? item.product_id, variant_id: item.variant_id ?? "—", variant_sku: item.variant_sku ?? "—", variant_name: item.variant_name ?? item.variant_id ?? "—", qty: item.qty })),
    metadata: (order.metadata ?? []).map((item) => ({ name: item.field_name ?? item.sales_doc_metadata_field_id, value: item.value })),
  };
}
