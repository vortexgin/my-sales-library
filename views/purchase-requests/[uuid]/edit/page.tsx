import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connectDatabase } from "@/database/sequelize";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { PurchaseRequestForm } from "@/app/sales/components/purchaseRequest/PurchaseRequestForm";
import { requireSession } from "@/libraries/Auth";
import { PurchaseRequestGetUseCase } from "@/app/sales/useCases/purchaseRequest/PurchaseRequestGetUseCase";

export const metadata: Metadata = {
  title: "Edit purchase request | VortexGin",
};

export default async function PurchaseRequestEditPage({
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
      allowedPermissions={["sales:purchase-request:view:update"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <PurchaseRequestForm
          mode="edit"
          uuid={request.uuid}
          session={session}
          initial={{
            customer_id: request.customer_id,
            warehouse_id: request.warehouse_id,
            discount_pct: request.discount_pct,
            notes: request.notes,
            status: request.status,
            items: (request.items ?? []).map((item) => ({
              product_id: item.product_id,
              variant_id: item.variant_id,
              qty: item.qty,
              unit_price: item.unit_price,
              discount_pct: item.discount_pct,
              notes: item.notes,
            })),
          }}
        />
      </main>
    </AuthComponent>
  );
}
