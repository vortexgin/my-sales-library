import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connectDatabase } from "@/database/sequelize";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { LeadForm } from "@/app/sales/components/lead/LeadForm";
import { requireSession } from "@/libraries/Auth";
import { LeadGetUseCase } from "@/app/sales/useCases/lead/LeadGetUseCase";
import { LeadMetadataListUseCase } from "@/app/sales/useCases/leadMetadata/LeadMetadataListUseCase";
import { LeadMetadataFieldListUseCase } from "@/app/sales/useCases/leadMetadataField/LeadMetadataFieldListUseCase";

export const metadata: Metadata = {
  title: "Edit lead | VortexGin",
};

export default async function LeadEditPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const session = await requireSession();
  const { uuid } = await params;
  await connectDatabase();

  let lead;
  try {
    lead = await new LeadGetUseCase().exec(uuid);
  } catch {
    notFound();
  }
  if (!lead) {
    notFound();
  }

  const actor = session.user as Record<string, unknown> | null;
  const [metadataRows, fieldRows] = await Promise.all([
    new LeadMetadataListUseCase().exec({ filter: { leads_id: uuid }, limit: 500 }).catch(() => []),
    new LeadMetadataFieldListUseCase().exec({ limit: 500 }, actor).catch(() => []),
  ]);

  const fieldNameById = new Map((fieldRows ?? []).map((field) => [field.uuid, field.name]));

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:lead:view:update"]}
      accessDeniedComponent={<AccessDenied />}
    >
      <LeadForm
        mode="edit"
        uuid={lead.uuid}
        session={session}
        initial={{
          name: lead.name,
          email: lead.email,
          phone_number: lead.phone_number,
          company: lead.company,
          source: lead.source as "website" | "referral" | "ads" | "cold_call" | "event" | "other",
          status: lead.status,
          value: lead.value,
          assigned_to: lead.assigned_to,
          notes: lead.notes,
          metadata: (metadataRows ?? []).map((row) => ({
            uuid: row.uuid,
            lead_metadata_field_id: row.lead_metadata_field_id,
            value: row.value,
            field_name: fieldNameById.get(row.lead_metadata_field_id),
          })),
        }}
      />
    </AuthComponent>
  );
}
