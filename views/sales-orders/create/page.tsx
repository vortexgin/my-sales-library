import type { Metadata } from "next";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { SalesOrderForm } from "@/app/sales/components/salesOrder/SalesOrderForm";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "New sales order | VortexGin",
};

export default async function SalesOrderCreatePage({
  searchParams,
}: {
  searchParams?: Promise<{ customer_id?: string; purchase_request_id?: string }>;
}) {
  const session = await requireSession();
  const query = (await searchParams) ?? {};

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:sales-order:create:create"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >

      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <SalesOrderForm
          mode="create"
          session={session}
          initial={{
            ...(query.customer_id ? { customer_id: query.customer_id } : {}),
            ...(query.purchase_request_id ? { purchase_request_id: query.purchase_request_id } : {}),
          }}
        />
      </main>
    </AuthComponent>
  );
}
