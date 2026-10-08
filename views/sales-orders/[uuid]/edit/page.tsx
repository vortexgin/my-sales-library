import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connectDatabase } from "@/database/sequelize";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { SalesOrderForm } from "@/app/sales/components/salesOrder/SalesOrderForm";
import { requireSession } from "@/libraries/Auth";
import { SalesOrderGetUseCase } from "@/app/sales/useCases/salesOrder/SalesOrderGetUseCase";

export const metadata: Metadata = {
  title: "Edit sales order | VortexGin",
};

export default async function SalesOrderEditPage({
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
      allowedPermissions={["sales:sales-order:view:update"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <SalesOrderForm
          mode="edit"
          uuid={order.uuid}
          session={session}
          initial={{
            customer_id: order.customer_id,
            purchase_request_id: order.purchase_request_id,
            warehouse_id: order.warehouse_id,
            discount_pct: order.discount_pct,
            notes: order.notes,
            status: order.status,
            items: order.items.map((item: { product_id: string; variant_id: string | null; qty: number; unit_price: number; discount_pct: number; notes: string | null }) => ({
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
