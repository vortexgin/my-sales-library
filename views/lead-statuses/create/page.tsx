import type { Metadata } from "next";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { LeadStatusForm } from "@/app/sales/components/leadStatus/LeadStatusForm";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "New lead status | VortexGin",
};

export default async function LeadStatusCreatePage() {
  const session = await requireSession();

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:lead-status:create:create"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >

      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <LeadStatusForm mode="create" />
      </main>
    </AuthComponent>
  );
}
