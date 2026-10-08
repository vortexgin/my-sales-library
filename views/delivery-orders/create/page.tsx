import type { Metadata } from "next";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { DeliveryOrderForm } from "@/app/sales/components/deliveryOrder/DeliveryOrderForm";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "New delivery order | VortexGin",
};

export default async function DeliveryOrderCreatePage({
  searchParams,
}: {
  searchParams?: Promise<{ sales_order_id?: string }>;
}) {
  const session = await requireSession();
  const query = (await searchParams) ?? {};

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:delivery-order:create:create"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >

      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <DeliveryOrderForm mode="create" session={session} initialSalesOrderId={query.sales_order_id} />
      </main>
    </AuthComponent>
  );
}
