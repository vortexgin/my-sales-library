import type { Metadata } from "next";
import Link from "next/link";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { DeliveryOrderTable } from "@/app/sales/components/deliveryOrder/DeliveryOrderTable";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "Delivery orders | VortexGin",
};

export default async function DeliveryOrderListPage({
  searchParams,
}: {
  searchParams?: Promise<{ sales_order_id?: string; warehouse_id?: string; status?: string }>;
}) {
  const session = await requireSession();
  const query = (await searchParams) ?? {};
  const initialParams: Record<string, string> = {};
  if (query.sales_order_id) {
    initialParams["filter[sales_order_id]"] = query.sales_order_id;
  }
  if (query.warehouse_id) {
    initialParams["filter[warehouse_id]"] = query.warehouse_id;
  }
  if (query.status) {
    initialParams["filter[status]"] = query.status;
  }

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:delivery-order:list:list"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full">
          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Sales</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Delivery orders.</h1>
                <p className="mt-2 text-sm text-slate-500">
                  System-posted or paper shipments.
                </p>
              </div>
              <AuthComponent
                user={session.user}
                permissions={session.permissions}
                allowedPermissions={["sales:delivery-order:create:create"]}
              >
                <Link
                  href="/sales/views/delivery-orders/create"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  New delivery order
                </Link>
              </AuthComponent>
            </div>

            <DeliveryOrderTable session={session} initialParams={initialParams} />
          </div>
        </div>
      </main>
    </AuthComponent>
  );
}
