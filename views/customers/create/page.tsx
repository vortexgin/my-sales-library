import type { Metadata } from "next";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { CustomerForm } from "@/app/sales/components/customer/CustomerForm";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "New customer | VortexGin",
};

export default async function CustomerCreatePage() {
  const session = await requireSession();

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:customer:create:create"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >

      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <CustomerForm mode="create" session={session} />
      </main>
    </AuthComponent>
  );
}
