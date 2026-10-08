import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { connectDatabase } from "@/database/sequelize";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { DeleteSalesOrderButton } from "@/app/sales/components/salesOrder/DeleteSalesOrderButton";
import { SALES_ORDER_LIST_PATH } from "@/app/sales/views/sales-orders/paths";
import { requireSession } from "@/libraries/Auth";
import { SalesOrderGetUseCase } from "@/app/sales/useCases/salesOrder/SalesOrderGetUseCase";

export const metadata: Metadata = {
  title: "Sales order detail | VortexGin",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="break-all text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export default async function SalesOrderDetailPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const session = await requireSession();

  const { uuid } = await params;
  await connectDatabase();

  let order;
  try {
    order = await new SalesOrderGetUseCase().exec(uuid);
  } catch {
    notFound();
  }
  if (!order) {
    notFound();
  }

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:sales-order:view:detail"]}
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
              Order {order.uuid.slice(0, 8)} · {order.status}
            </h1>

            <dl className="mt-6">
              <Row label="UUID" value={order.uuid} />
              <Row label="Customer" value={order.customer_id} />
              <Row label="Purchase req" value={order.purchase_request_id ?? "—"} />
              <Row label="Warehouse" value={order.warehouse_id ?? "—"} />
              <Row label="Status" value={order.status} />
              <Row label="Subtotal" value={String(order.subtotal)} />
              <Row label="Discount %" value={String(order.discount_pct)} />
              <Row label="Grand total" value={String(order.grand_total)} />
              <Row label="Notes" value={order.notes ?? "—"} />
              <Row label="Created" value={order.created_at} />
            </dl>

            {order.items.length > 0 ? (
              <>
                <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Items</p>
                <ul className="mt-2 space-y-2">
                  {order.items.map((item: { uuid: string; product_id: string; qty: number; unit_price: number; line_total: number }) => (
                    <li key={item.uuid} className="rounded-xl border border-slate-200 p-3 text-sm">
                      <span className="font-medium text-slate-900">{item.product_id.slice(0, 8)}</span>
                      <span className="text-slate-500"> · {item.qty} × {item.unit_price} = {item.line_total}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={SALES_ORDER_LIST_PATH}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Back to list
              </Link>
              <AuthComponent
                user={session.user}
                permissions={session.permissions}
                allowedPermissions={["sales:delivery-order:create:create"]}
              >
                <Link
                  href={`/sales/views/delivery-orders/create?sales_order_id=${order.uuid}`}
                  className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
                >
                  Create delivery
                </Link>
              </AuthComponent>
              <AuthComponent
                user={session.user}
                permissions={session.permissions}
                allowedPermissions={["sales:sales-order:view:delete"]}
              >
                <DeleteSalesOrderButton uuid={order.uuid} label={order.uuid.slice(0, 8)} redirectTo={SALES_ORDER_LIST_PATH} />
              </AuthComponent>

            </div>
          </div>
          <ActivityTimeline entity="sales-order" entityUuid={order.uuid} />
        </div>
      </main>
    </AuthComponent>
  );
}
