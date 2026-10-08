import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { connectDatabase } from "@/database/sequelize";
import { hasPermission } from "@/libraries/Permissions";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { DeleteDeliveryOrderButton } from "@/app/sales/components/deliveryOrder/DeleteDeliveryOrderButton";
import { ShipDeliveryOrderButton } from "@/app/sales/components/deliveryOrder/ShipDeliveryOrderButton";
import { DELIVERY_ORDER_LIST_PATH } from "@/app/sales/views/delivery-orders/paths";
import { requireSession } from "@/libraries/Auth";
import { DeliveryOrderGetUseCase } from "@/app/sales/useCases/deliveryOrder/DeliveryOrderGetUseCase";

export const metadata: Metadata = {
  title: "Delivery order detail | VortexGin",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="break-all text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export default async function DeliveryOrderDetailPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const session = await requireSession();

  const { uuid } = await params;
  await connectDatabase();

  let order;
  try {
    order = await new DeliveryOrderGetUseCase().exec(uuid);
  } catch {
    notFound();
  }
  if (!order) {
    notFound();
  }

  const isDraft = order.status === "draft";
  const salesOrderLabel = order.sales_order
    ? `Order ${order.sales_order.id.slice(0, 8)} · ${order.sales_order.status}`
    : order.sales_order_id;
  const warehouseLabel = order.warehouse
    ? `${order.warehouse.name} (${order.warehouse.code})`
    : order.warehouse_id;
  const items = order.items ?? [];

  const canShip = hasPermission(session.user, session.permissions, ["sales:delivery-order:view:ship"]);

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:delivery-order:view:detail"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >

      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          {order.status === "shipped" && order.fulfillment === "paper" ? (
            <p role="status" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Paper delivery — stock not deducted. Ship again as system to post movements.
            </p>
          ) : null}
          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Detail</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              Delivery {order.doc_number ?? order.uuid.slice(0, 8)} · {order.status}
            </h1>

            <dl className="mt-6">
              <Row label="UUID" value={order.uuid} />
              <Row label="Doc number" value={order.doc_number ?? "—"} />
              <Row label="Sales order" value={salesOrderLabel} />
              <Row label="Warehouse" value={warehouseLabel} />
              <Row label="Status" value={order.status} />
              <Row label="Fulfillment" value={order.fulfillment ?? "—"} />
              <Row label="Stock deducted" value={order.stock_deducted ? "yes" : "no"} />
              <Row label="Notes" value={order.notes ?? "—"} />
              <Row label="Created" value={order.created_at} />
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={DELIVERY_ORDER_LIST_PATH}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Back to list
              </Link>
              {canShip ? (
                <ShipDeliveryOrderButton
                  uuid={order.uuid}
                  status={order.status}
                  fulfillment={order.fulfillment}
                  stockDeducted={order.stock_deducted}
                />
              ) : null}
              {isDraft || order.status === "packed" || order.status === "shipped" ? (
                <AuthComponent
                  user={session.user}
                  permissions={session.permissions}
                  allowedPermissions={["sales:delivery-order:view:update"]}
                >
                  <Link
                    href={`/sales/views/delivery-orders/${order.uuid}/edit`}
                    className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Edit
                  </Link>
                </AuthComponent>
              ) : null}
              {isDraft ? (
                <AuthComponent
                  user={session.user}
                  permissions={session.permissions}
                  allowedPermissions={["sales:delivery-order:view:delete"]}
                >
                  <DeleteDeliveryOrderButton uuid={order.uuid} label={order.uuid.slice(0, 8)} redirectTo={DELIVERY_ORDER_LIST_PATH} />
                </AuthComponent>
              ) : null}

            </div>
          </div>
          <ActivityTimeline entity="delivery_order" entityUuid={order.uuid} />
        </div>
      </main>
    </AuthComponent>
  );
}
