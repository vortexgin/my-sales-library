import type { Metadata } from "next";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { LeadImportClient } from "@/app/sales/components/lead/LeadImportClient";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "Import leads | VortexGin",
};

export default async function LeadImportPage() {
  const session = await requireSession();

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:lead:create:create"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <LeadImportClient />
      </main>
    </AuthComponent>
  );
}
