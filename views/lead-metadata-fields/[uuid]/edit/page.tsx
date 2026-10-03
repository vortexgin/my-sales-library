import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connectDatabase } from "@/database/sequelize";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { LeadMetadataFieldForm } from "@/app/sales/components/leadMetadataField/LeadMetadataFieldForm";
import { requireSession } from "@/libraries/Auth";
import { LeadMetadataFieldGetUseCase } from "@/app/sales/useCases/leadMetadataField/LeadMetadataFieldGetUseCase";

export const metadata: Metadata = {
  title: "Edit lead metadata field | VortexGin",
};

export default async function LeadMetadataFieldEditPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const session = await requireSession();

  const { uuid } = await params;
  await connectDatabase();

  let leadMetadataField;
  try {
    leadMetadataField = await new LeadMetadataFieldGetUseCase().exec(uuid);
  } catch {
    notFound();
  }
  if (!leadMetadataField) {
    notFound();
  }

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:lead-metadata-field:view:update"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <LeadMetadataFieldForm
          mode="edit"
          uuid={leadMetadataField.uuid}
          initial={{
            name: leadMetadataField.name,
            description: leadMetadataField.description,
            status: leadMetadataField.status,
          }}
        />
      </main>
    </AuthComponent>
  );
}
