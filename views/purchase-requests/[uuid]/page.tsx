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

export const metadata: Metadata = {
  title: "Purchase request detail | VortexGin",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="break-all text-sm text-slate-900">{value}</dd>
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
              Request {request.uuid.slice(0, 8)} · {request.status}
            </h1>

            <dl className="mt-6">
              <Row label="UUID" value={request.uuid} />
              <Row label="Customer" value={request.customer_id} />
              <Row label="Warehouse" value={request.warehouse_id ?? "—"} />
              <Row label="Status" value={request.status} />
              <Row label="Subtotal" value={String(request.subtotal)} />
              <Row label="Discount %" value={String(request.discount_pct)} />
              <Row label="Grand total" value={String(request.grand_total)} />
              <Row label="Notes" value={request.notes ?? "—"} />
              <Row label="Created" value={request.created_at} />
            </dl>

            {request.items.length > 0 ? (
              <>
                <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Items</p>
                <ul className="mt-2 space-y-2">
                  {request.items.map((item: { uuid: string; product_id: string; qty: number; unit_price: number; line_total: number }) => (
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
                href={PURCHASE_REQUEST_LIST_PATH}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Back to list
              </Link>
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
              <AuthComponent
                user={session.user}
                permissions={session.permissions}
                allowedPermissions={["sales:purchase-request:view:delete"]}
              >
                <DeletePurchaseRequestButton uuid={request.uuid} label={request.uuid.slice(0, 8)} redirectTo={PURCHASE_REQUEST_LIST_PATH} />
              </AuthComponent>

            </div>
          </div>
          <ActivityTimeline entity="purchase_request" entityUuid={request.uuid} />
        </div>
      </main>
    </AuthComponent>
  );
}
