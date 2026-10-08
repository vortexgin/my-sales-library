import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { connectDatabase } from "@/database/sequelize";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { DeleteLeadButton } from "@/app/sales/components/lead/DeleteLeadButton";
import { LeadConvertButton } from "@/app/sales/components/lead/LeadConvertButton";
import { LeadDetailClient } from "@/app/sales/components/lead/LeadDetailClient";
import { LEAD_LIST_PATH } from "@/app/sales/views/leads/paths";
import { requireSession } from "@/libraries/Auth";
import { hasPermission } from "@/libraries/Permissions";
import { LeadGetUseCase } from "@/app/sales/useCases/lead/LeadGetUseCase";
import { formatMoney } from "@/libraries/Currency";
import CustomerModelFactory, { CustomerModel } from "@/app/sales/models/CustomerModel";
import { LeadMetadataListUseCase } from "@/app/sales/useCases/leadMetadata/LeadMetadataListUseCase";
import { LeadMetadataFieldListUseCase } from "@/app/sales/useCases/leadMetadataField/LeadMetadataFieldListUseCase";
import { LeadActivityListUseCase } from "@/app/sales/useCases/leadActivity/LeadActivityListUseCase";

export const metadata: Metadata = {
  title: "Lead detail | VortexGin",
};

function Row({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`break-all text-sm text-slate-900${numeric ? " tabular-nums sm:ml-auto sm:text-right" : ""}`}>{value}</dd>
    </div>
  );
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const session = await requireSession();
  const { uuid } = await params;
  await connectDatabase();

  let lead;
  try {
    lead = await new LeadGetUseCase().exec(uuid, session.user);
  } catch {
    notFound();
  }
  if (!lead) {
    notFound();
  }

  const assigneeLabel = lead.assignee?.name ? lead.assignee.name : (lead.assigned_to ?? "—");

  const actor = session.user as Record<string, unknown> | null;
  const [metadataRows, fieldRows, activityRows] = await Promise.all([
    new LeadMetadataListUseCase().exec({ filter: { leads_id: uuid }, limit: 500 }),
    new LeadMetadataFieldListUseCase().exec({ limit: 500 }, actor).catch(() => []),
    new LeadActivityListUseCase().exec({ filter: { leads_id: uuid }, limit: 500 }).catch(() => []),
  ]);

  const fieldNameById = new Map((fieldRows ?? []).map((field) => [field.uuid, field.name]));

  // A lead with a customer row (convert sets customer.lead_id) is already
  // converted: hide the Convert button and link to the customer instead.
  // Best-effort read; a lookup failure keeps the button visible.
  let convertedCustomerUuid: string | null = null;
  try {
    await CustomerModelFactory();
    const converted = await CustomerModel.findOne({ where: { lead_id: uuid, deleted_at: null } });
    convertedCustomerUuid = converted?.uuid ?? null;
  } catch {
    convertedCustomerUuid = null;
  }  const metadataUuids = (metadataRows ?? []).map((row) => row.uuid);
  const activityUuids = (activityRows ?? []).map((row) => row.uuid);
  const fieldUuids = (metadataRows ?? [])
    .map((row) => row.lead_metadata_field_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const canCreateActivity = hasPermission(session.user, session.permissions, [
    "sales:lead-activity:create:create",
  ]);
  const canUpload = hasPermission(session.user, session.permissions, [
    "base:tools:upload:upload",
  ]);

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:lead:view:detail"]}
      accessDeniedComponent={<AccessDenied />}
    >
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Detail</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{lead.name}</h1>

          <dl className="mt-6">
            <Row label="UUID" value={lead.uuid} />
            <Row label="Name" value={lead.name} />
            <Row label="Email" value={lead.email} />
            <Row label="Phone" value={lead.phone_number} />
            <Row label="Company" value={lead.company ?? "—"} />
            <Row label="Source" value={lead.source} />
            <Row label="Status" value={lead.status} />
            <Row label="Value" value={typeof lead.value === "number" ? formatMoney(lead.value) : "—"} numeric />
            <Row label="Assigned to" value={assigneeLabel} />
            <Row label="Notes" value={lead.notes ?? "—"} />
            <Row label="Created" value={lead.created_at} />
            <Row label="Updated" value={lead.updated_at} />
          </dl>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={LEAD_LIST_PATH}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Back to board
            </Link>
            <AuthComponent
              user={session.user}
              permissions={session.permissions}
              allowedPermissions={["sales:lead:view:update"]}
            >
              <Link
                href={`/sales/views/leads/${lead.uuid}/edit`}
                className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Edit
              </Link>
            </AuthComponent>
            <AuthComponent
              user={session.user}
              permissions={session.permissions}
              allowedPermissions={["sales:lead:view:delete"]}
            >
              <DeleteLeadButton uuid={lead.uuid} label={lead.name} redirectTo={LEAD_LIST_PATH} />
            </AuthComponent>
            {convertedCustomerUuid ? (
              <AuthComponent
                user={session.user}
                permissions={session.permissions}
                allowedPermissions={["sales:customer:view:detail"]}
              >
                <Link
                  href={`/sales/views/customers/${convertedCustomerUuid}`}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  View customer
                </Link>
              </AuthComponent>
            ) : (
              <AuthComponent
                user={session.user}
                permissions={session.permissions}
                allowedPermissions={["sales:customer:create:create"]}
              >
                <LeadConvertButton leadUuid={lead.uuid} label={lead.name} />
              </AuthComponent>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Metadata</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">Leads metadata.</h2>
          {!metadataRows || metadataRows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No metadata for this lead yet.</p>
          ) : (
            <dl className="mt-4">
              {metadataRows.map((row) => (
                <div
                  key={row.uuid}
                  className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-6"
                >
                  <dt className="w-48 shrink-0 text-xs font-medium uppercase tracking-wider text-slate-500">
                    {fieldNameById.get(row.lead_metadata_field_id) ?? row.lead_metadata_field_id}
                  </dt>
                  <dd className="break-all text-sm text-slate-900">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <LeadDetailClient
          leadUuid={lead.uuid}
          initialMetadataUuids={metadataUuids}
          initialActivityUuids={activityUuids}
          initialFieldUuids={fieldUuids}
          canCreateActivity={canCreateActivity}
          canUpload={canUpload}
        />
      </div>
    </AuthComponent>
  );
}
