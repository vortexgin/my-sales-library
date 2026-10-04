import type { Metadata } from "next";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { LeadForm } from "@/app/sales/components/lead/LeadForm";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "New lead | VortexGin",
};

export default async function LeadCreatePage() {
  const session = await requireSession();

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:lead:create:create"]}
      accessDeniedComponent={<AccessDenied />}
    >
      <LeadForm mode="create" />
    </AuthComponent>
  );
}
