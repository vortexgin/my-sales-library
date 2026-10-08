import type { Metadata } from "next";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { PurchaseRequestForm } from "@/app/sales/components/purchaseRequest/PurchaseRequestForm";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "New purchase request | VortexGin",
};

export default async function PurchaseRequestCreatePage({
  searchParams,
}: {
  searchParams?: Promise<{ customer_id?: string }>;
}) {
  const session = await requireSession();
  const query = (await searchParams) ?? {};

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:purchase-request:create:create"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >

      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <PurchaseRequestForm
          mode="create"
          session={session}
          initial={query.customer_id ? { customer_id: query.customer_id } : undefined}
        />
      </main>
    </AuthComponent>
  );
}
