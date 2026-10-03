import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connectDatabase } from "@/database/sequelize";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { LeadStatusForm } from "@/app/sales/components/leadStatus/LeadStatusForm";
import { requireSession } from "@/libraries/Auth";
import { LeadStatusGetUseCase } from "@/app/sales/useCases/leadStatus/LeadStatusGetUseCase";

export const metadata: Metadata = {
  title: "Edit lead status | VortexGin",
};

export default async function LeadStatusEditPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const session = await requireSession();

  const { uuid } = await params;
  await connectDatabase();

  let leadStatus;
  try {
    leadStatus = await new LeadStatusGetUseCase().exec(uuid);
  } catch {
    notFound();
  }
  if (!leadStatus) {
    notFound();
  }

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:lead-status:view:update"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <LeadStatusForm
          mode="edit"
          uuid={leadStatus.uuid}
          initial={{
            name: leadStatus.name,
            description: leadStatus.description,
            status: leadStatus.status,
          }}
        />
      </main>
    </AuthComponent>
  );
}
