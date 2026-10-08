import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connectDatabase } from "@/database/sequelize";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { DeliveryOrderForm } from "@/app/sales/components/deliveryOrder/DeliveryOrderForm";
import { requireSession } from "@/libraries/Auth";
import { DeliveryOrderGetUseCase } from "@/app/sales/useCases/deliveryOrder/DeliveryOrderGetUseCase";

export const metadata: Metadata = {
  title: "Edit delivery order | VortexGin",
};

export default async function DeliveryOrderEditPage({
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

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:delivery-order:view:update"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <DeliveryOrderForm
          mode="edit"
          uuid={order.uuid}
          session={session}
          initial={{
            notes: order.notes,
            status: order.status,
            metadata: (order.metadata ?? []).map((item) => ({
              uuid: item.uuid,
              sales_doc_metadata_field_id: item.sales_doc_metadata_field_id,
              field_name: item.field_name,
              value: item.value,
            })),
          }}
        />
      </main>
    </AuthComponent>
  );
}
