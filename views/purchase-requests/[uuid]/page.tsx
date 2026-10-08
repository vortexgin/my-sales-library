import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { connectDatabase } from "@/database/sequelize";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { DeletePurchaseRequestButton } from "@/app/sales/components/purchaseRequest/DeletePurchaseRequestButton";
import { PURCHASE_REQUEST_LIST_PATH } from "@/app/sales/views/purchase-requests/paths";
import { requireSession } from "@/libraries/Auth";
import { PurchaseRequestGetUseCase } from "@/app/sales/useCases/purchaseRequest/PurchaseRequestGetUseCase";
import SalesOrderModelFactory, { SalesOrderModel } from "@/app/sales/models/SalesOrderModel";
import { formatMoney } from "@/libraries/Currency";

export const metadata: Metadata = {
  title: "Purchase request detail | VortexGin",
};

function Row({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`break-all text-sm text-slate-900${numeric ? " tabular-nums sm:ml-auto sm:text-right" : ""}`}>{value}</dd>
    </div>
  );
}

export default async function PurchaseRequestDetailPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const session = await requireSession();

  const { uuid } = await params;
  await connectDatabase();

  let request;
  try {
    request = await new PurchaseRequestGetUseCase().exec(uuid);
  } catch {
    notFound();
  }
  if (!request) {
    notFound();
  }

  const customerLabel = request.customer?.name ?? request.customer_id;
  const warehouseLabel = request.warehouse
    ? `${request.warehouse.name} (${request.warehouse.code})`
    : (request.warehouse_id ?? "—");
  const items = request.items ?? [];
  const metadataRows = request.metadata ?? [];

  // A PR with a sales order (SO stores purchase_request_id) is already
  // converted: hide Create/Delete and link to the order instead.
  // Best-effort read; a lookup failure keeps the buttons visible.
  let convertedSalesOrderUuid: string | null = null;
  try {
    await SalesOrderModelFactory();
    const converted = await SalesOrderModel.findOne({
      where: { purchase_request_id: uuid, deleted_at: null },
      order: [["created_at", "ASC"]],
    });
    convertedSalesOrderUuid = converted?.uuid ?? null;
  } catch {
    convertedSalesOrderUuid = null;
  }

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:purchase-request:view:detail"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >

      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Detail</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              Request {request.doc_number ?? request.uuid.slice(0, 8)} · {request.status}
            </h1>

            <dl className="mt-6">
              <Row label="UUID" value={request.uuid} />
              <Row label="Doc number" value={request.doc_number ?? "—"} />
              <Row label="Customer" value={customerLabel} />
              <Row label="Warehouse" value={warehouseLabel} />
              <Row label="Status" value={request.status} />
              <Row label="Subtotal" value={formatMoney(request.subtotal)} numeric />
              <Row label="Discount %" value={String(request.discount_pct)} />
              <Row label="Grand total" value={formatMoney(request.grand_total)} numeric />
              <Row label="Notes" value={request.notes ?? "—"} />
              <Row label="Created" value={request.created_at} />
            </dl>

            {items.length > 0 ? (
              <>
                <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Items</p>
                <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                        <th scope="col" className="px-3 py-2 font-medium">Product</th>
                        <th scope="col" className="px-3 py-2 font-medium">Variant</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Qty</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Unit price</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Disc %</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.uuid} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {item.product_sku ? `${item.product_sku} · ${item.product_name ?? ""}`.trim() : item.product_id}
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {item.variant_sku ? `${item.variant_sku} · ${item.variant_name ?? ""}`.trim() : (item.variant_id ?? "—")}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-900">{item.qty}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-900">{formatMoney(item.unit_price)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-900">{item.discount_pct}</td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-900">{formatMoney(item.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {metadataRows.length > 0 ? (
              <section className="mt-6">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Metadata</p>
                <dl className="mt-2 rounded-xl border border-slate-200 px-4">
                  {metadataRows.map((item) => (
                    <Row
                      key={item.uuid}
                      label={item.field_name ?? item.sales_doc_metadata_field_id}
                      value={item.value}
                    />
                  ))}
                </dl>
              </section>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={PURCHASE_REQUEST_LIST_PATH}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Back to list
              </Link>
              {convertedSalesOrderUuid ? (
                <AuthComponent
                  user={session.user}
                  permissions={session.permissions}
                  allowedPermissions={["sales:sales-order:view:detail"]}
                >
                  <Link
                    href={`/sales/views/sales-orders?purchase_request_id=${request.uuid}`}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    View sales order
                  </Link>
                </AuthComponent>
              ) : null}
              {!convertedSalesOrderUuid ? (
                <AuthComponent
                  user={session.user}
                  permissions={session.permissions}
                  allowedPermissions={["sales:purchase-request:view:update"]}
                >
                  <Link
                    href={`/sales/views/purchase-requests/${request.uuid}/edit`}
                    className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Edit
                  </Link>
                </AuthComponent>
              ) : null}
              {request.status === "approved" || request.status === "closed" ? (
                <AuthComponent
                  user={session.user}
                  permissions={session.permissions}
                  allowedPermissions={["sales:sales-order:create:create"]}
                >
                  <Link
                    href={`/sales/views/sales-orders/create?purchase_request_id=${request.uuid}`}
                    className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
                  >
                    Create sales order
                  </Link>
                </AuthComponent>
              ) : null}
              {!convertedSalesOrderUuid ? (
                <AuthComponent
                  user={session.user}
                  permissions={session.permissions}
                  allowedPermissions={["sales:purchase-request:view:delete"]}
                >
                  <DeletePurchaseRequestButton uuid={request.uuid} label={request.uuid.slice(0, 8)} redirectTo={PURCHASE_REQUEST_LIST_PATH} />
                </AuthComponent>
              ) : null}
            </div>
          </div>
          <ActivityTimeline entity="purchase_request" entityUuid={request.uuid} />
        </div>
      </main>
    </AuthComponent>
  );
}
