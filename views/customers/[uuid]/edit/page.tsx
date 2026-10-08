import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connectDatabase } from "@/database/sequelize";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { CustomerForm } from "@/app/sales/components/customer/CustomerForm";
import { requireSession } from "@/libraries/Auth";
import { CustomerGetUseCase } from "@/app/sales/useCases/customer/CustomerGetUseCase";
import { CustomerMetadataListUseCase } from "@/app/sales/useCases/customerMetadata/CustomerMetadataListUseCase";
import { CustomerMetadataFieldListUseCase } from "@/app/sales/useCases/customerMetadataField/CustomerMetadataFieldListUseCase";

export const metadata: Metadata = {
  title: "Edit customer | VortexGin",
};

export default async function CustomerEditPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const session = await requireSession();

  const { uuid } = await params;
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

  const [metadataRows, fields] = await Promise.all([
    new CustomerMetadataListUseCase().exec({ filter: { customer_id: uuid }, limit: 500 }).catch(() => []),
    new CustomerMetadataFieldListUseCase().exec({ limit: 500 }).catch(() => []),
  ]);
  const fieldNames = new Map(fields.map((field) => [field.uuid, field.name]));

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:customer:view:update"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <CustomerForm
          mode="edit"
          uuid={customer.uuid}
          session={session}
          initial={{
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            company_name: customer.company_name,
            notes: customer.notes,
            status: customer.status,
            metadata: metadataRows.map((row) => ({
              uuid: row.uuid,
              customer_metadata_field_id: row.customer_metadata_field_id,
              value: row.value,
              field_name: fieldNames.get(row.customer_metadata_field_id),
            })),
          }}
        />
      </main>
    </AuthComponent>
  );
}
