import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { connectDatabase } from "@/database/sequelize";
import { hasPermission } from "@/libraries/Permissions";
import { formatMoney } from "@/libraries/Currency";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { DeleteCustomerButton } from "@/app/sales/components/customer/DeleteCustomerButton";
import { CustomerActivitySection } from "@/app/sales/components/customer/CustomerActivitySection";
import { CUSTOMER_LIST_PATH } from "@/app/sales/views/customers/paths";
import { requireSession } from "@/libraries/Auth";
import { CustomerGetUseCase } from "@/app/sales/useCases/customer/CustomerGetUseCase";
import { CustomerMetadataListUseCase } from "@/app/sales/useCases/customerMetadata/CustomerMetadataListUseCase";
import { CustomerMetadataFieldListUseCase } from "@/app/sales/useCases/customerMetadataField/CustomerMetadataFieldListUseCase";
import { SalesOrderListUseCase } from "@/app/sales/useCases/salesOrder/SalesOrderListUseCase";

export const metadata: Metadata = {
  title: "Customer detail | VortexGin",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="break-all text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams?: Promise<{ converted?: string }>;
}) {
  const session = await requireSession();

  const { uuid } = await params;
  const query = (await searchParams) ?? {};
  await connectDatabase();

  let customer;
  try {
    customer = await new CustomerGetUseCase().exec(uuid);
  } catch {
    notFound();
  }
  if (!customer) {
    notFound();
  }

  const [metadataRows, fields, orders] = await Promise.all([
    new CustomerMetadataListUseCase().exec({ filter: { customer_id: uuid }, limit: 100 }).catch(() => []),
    new CustomerMetadataFieldListUseCase().exec({ limit: 100 }).catch(() => []),
    new SalesOrderListUseCase()
      .exec({ filter: { customer_id: uuid }, limit: 50 }, session.user)
      .catch(() => []),
  ]);
  const fieldNames = new Map(fields.map((field) => [field.uuid, field.name]));

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:customer:view:detail"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >

      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          {query.converted === "1" ? (
            <p role="status" className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Lead converted to this customer.
            </p>
          ) : null}
          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Detail</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              {customer.name}
            </h1>

            <dl className="mt-6">
              <Row label="UUID" value={customer.uuid} />
              <Row label="Name" value={customer.name} />
              <Row label="Email" value={customer.email} />
              <Row label="Phone" value={customer.phone} />
              <Row label="Company" value={customer.company_name ?? "—"} />
              <Row label="Notes" value={customer.notes ?? "—"} />
              <Row label="Status" value={customer.status} />
              <Row label="Created" value={customer.created_at} />
              <Row label="Updated" value={customer.updated_at} />
            </dl>

            {metadataRows.length > 0 ? (
              <>
                <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Metadata</p>
                <dl className="mt-2">
                  {metadataRows.map((row) => (
                    <Row
                      key={row.uuid}
                      label={fieldNames.get(row.customer_metadata_field_id) ?? row.customer_metadata_field_id}
                      value={row.value}
                    />
                  ))}
                </dl>
              </>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={CUSTOMER_LIST_PATH}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Back to list
              </Link>
              <AuthComponent
                user={session.user}
                permissions={session.permissions}
                allowedPermissions={["sales:customer:view:update"]}
              >
                <Link
                  href={`/sales/views/customers/${customer.uuid}/edit`}
                  className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Edit
                </Link>
              </AuthComponent>
              <AuthComponent
                user={session.user}
                permissions={session.permissions}
                allowedPermissions={["sales:customer:view:delete"]}
              >
                <DeleteCustomerButton uuid={customer.uuid} label={customer.name} redirectTo={CUSTOMER_LIST_PATH} />
              </AuthComponent>

            </div>
          </div>

          <div className="mt-6 rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Orders</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">Sales-order history.</h2>
              </div>
              <AuthComponent
                user={session.user}
                permissions={session.permissions}
                allowedPermissions={["sales:sales-order:create:create"]}
              >
                <Link
                  href={`/sales/views/sales-orders/create?customer_id=${customer.uuid}`}
                  className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  New sales order
                </Link>
              </AuthComponent>
            </div>
            {orders.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No sales orders yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {orders.map((order) => (
                  <li key={order.uuid} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/sales/views/sales-orders/${order.uuid}`}
                        className="font-medium text-blue-600 hover:text-blue-500"
                      >
                        {order.uuid.slice(0, 8)} · {order.status}
                      </Link>
                      <span className="inline-flex rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium tabular-nums text-green-700">
                        {formatMoney(order.grand_total)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(order.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <CustomerActivitySection
            customerUuid={customer.uuid}
            session={session}
            canCreate={hasPermission(session.user, session.permissions, ["sales:customer-activity:create:create"])}
          />

          <ActivityTimeline entity="customer" entityUuid={customer.uuid} />
        </div>
      </main>
    </AuthComponent>
  );
}
