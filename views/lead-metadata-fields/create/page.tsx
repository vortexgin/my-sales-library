import type { Metadata } from "next";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { LeadMetadataFieldForm } from "@/app/sales/components/leadMetadataField/LeadMetadataFieldForm";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "New lead metadata field | VortexGin",
};

export default async function LeadMetadataFieldCreatePage() {
  const session = await requireSession();

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:lead-metadata-field:create:create"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >

      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <LeadMetadataFieldForm mode="create" />
      </main>
    </AuthComponent>
  );
}
