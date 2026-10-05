"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { LEAD_LIST_PATH } from "@/app/sales/views/leads/paths";
import type { Lead } from "@/app/sales/models/LeadModel";
import type { LeadMetadata } from "@/app/sales/models/LeadMetadataModel";
import type { LeadMetadataField } from "@/app/sales/models/LeadMetadataFieldModel";
import type { LeadStatus } from "@/app/sales/models/LeadStatusModel";
import type { User } from "@/app/base/models/UserModel";
import { AuthComponent } from "@/components/AuthComponent";
import { SelectField, TextAreaField, TextField } from "@/components/FormField";
import { UploadButton } from "@/components/UploadButton";
import type { SessionInfo } from "@/libraries/Auth";
import { getEncrypted, postEncrypted, putEncrypted } from "@/libraries/EncryptedFetch";

const LEADS_API = "/sales/api/v1/leads";
const USERS_API = "/base/api/v1/users";
const UPLOAD_PERMISSION = "base:tools:upload:upload";
const NEW_FIELD_VALUE = "__new__";

const SOURCE_OPTIONS = [
  { value: "website", label: "website" },
  { value: "referral", label: "referral" },
  { value: "ads", label: "ads" },
  { value: "cold_call", label: "cold_call" },
  { value: "event", label: "event" },
  { value: "other", label: "other" },
];

const rowLabelClass = "mb-1 block text-xs font-medium text-slate-600";
const rowInputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500";
const rowValueInputClass =
  "w-full min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500";

type MetadataRow = {
  key: string;
  uuid?: string;
  field_id: string;
  value: string;
  isNew: boolean;
  newName: string;
};

export type LeadFormInitial = Partial<Pick<Lead, "name" | "email" | "phone_number" | "company" | "source" | "status" | "value" | "assigned_to" | "notes">> & {
  metadata?: Array<Pick<LeadMetadata, "uuid" | "lead_metadata_field_id" | "value"> & { field_name?: string }>;
};

function newRow(): MetadataRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    field_id: "",
    value: "",
    isNew: false,
    newName: "",
  };
}

export function LeadForm({
  mode,
  uuid,
  initial,
  session,
}: {
  mode: "create" | "edit";
  uuid?: string;
  initial?: LeadFormInitial;
  session: SessionInfo;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [statuses, setStatuses] = useState<LeadStatus[]>([]);
  const [fields, setFields] = useState<LeadMetadataField[]>([]);
  const [assignees, setAssignees] = useState<User[]>([]);
  const [assigneeId, setAssigneeId] = useState(initial?.assigned_to ?? "");
  const [assigneesLoading, setAssigneesLoading] = useState(true);
  const [assigneesError, setAssigneesError] = useState("");
  const [statusesError, setStatusesError] = useState("");
  const [fieldsError, setFieldsError] = useState("");
  const [rows, setRows] = useState<MetadataRow[]>(() => {
    if (initial?.metadata && initial.metadata.length > 0) {
      return initial.metadata.map((item, index) => ({
        key: item.uuid ?? `initial-${index}-${Math.random().toString(36).slice(2)}`,
        uuid: item.uuid,
        field_id: item.lead_metadata_field_id,
        value: item.value,
        isNew: false,
        newName: "",
      }));
    }
    return [newRow()];
  });

  // Keep the current assignee selectable even when outside the
  // organization-scoped list (e.g. assignment predates an org move).
  const assigneeItems =
    initial?.assigned_to && !assignees.some((option) => option.uuid === initial.assigned_to)
      ? [{ uuid: initial.assigned_to, name: initial.assigned_to, email: "" } as User, ...assignees]
      : assignees;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Independent degrade: a statuses or fields failure surfaces its own
        // error and must not block the other dropdowns (free-form fallbacks
        // — status text input, add-new-field — stay usable).
        const [statusResult, fieldResult, userResult] = await Promise.allSettled([
          getEncrypted<LeadStatus[]>(`/sales/api/v1/lead-statuses?limit=100&sortProperty=name&sortDirection=asc`),
          getEncrypted<LeadMetadataField[]>(`/sales/api/v1/lead-metadata-fields?limit=100&sortProperty=name&sortDirection=asc`),
          getEncrypted<User[]>(`${USERS_API}?sortProperty=name&sortDirection=asc&limit=100&filter[org_scope]=actor`),
        ]);
        if (!active) {
          return;
        }
        if (statusResult.status === "fulfilled" && statusResult.value.success) {
          setStatuses((statusResult.value.data ?? []).filter((row) => row.status !== "deleted"));
        } else {
          setStatusesError(
            (statusResult.status === "fulfilled" ? statusResult.value.message : null) ||
              "Failed to load statuses. You can still type a status manually.",
          );
        }
        if (fieldResult.status === "fulfilled" && fieldResult.value.success) {
          setFields((fieldResult.value.data ?? []).filter((row) => row.status !== "deleted"));
        } else {
          setFieldsError(
            (fieldResult.status === "fulfilled" ? fieldResult.value.message : null) ||
              "Failed to load metadata fields. You can still add a new field manually.",
          );
        }
        if (userResult.status === "fulfilled" && userResult.value.success) {
          setAssignees(userResult.value.data ?? []);
        } else {
          setAssigneesError(
            (userResult.status === "fulfilled" ? userResult.value.message : null) ||
              "Failed to load users.",
          );
        }
      } catch {
        if (active) {
          setStatusesError((current) => current || "Failed to load statuses. You can still type a status manually.");
          setFieldsError((current) => current || "Failed to load metadata fields. You can still add a new field manually.");
          setAssigneesError((current) => current || "Failed to load users. Please try again.");
        }
        // Dropdowns stay empty; user can still type free-form values.
      } finally {
        if (active) {
          setAssigneesLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function updateRow(key: string, patch: Partial<MetadataRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      const valueRaw = String(formData.get("value") ?? "").trim();
      const payload: Record<string, unknown> = {
        name: String(formData.get("name") ?? "").trim(),
        email: String(formData.get("email") ?? "").trim(),
        phone_number: String(formData.get("phone_number") ?? "").trim(),
        company: String(formData.get("company") ?? "").trim() || null,
        source: String(formData.get("source") ?? "website"),
        status: String(formData.get("status") ?? "new").trim() || "new",
        value: valueRaw === "" ? null : Number(valueRaw),
        assigned_to: assigneeId || null,
        notes: String(formData.get("notes") ?? "").trim() || null,
      };
      if (typeof payload.value === "number" && Number.isNaN(payload.value)) {
        setError("Value must be a number.");
        return;
      }

      // Omission = delete: LeadUpdateUseCase syncs metadata with full
      // replacement, so rows left out of this payload are soft-deleted
      // server-side (sending metadata: [] deletes all). Empty-value rows are
      // dropped here — a blank value cannot clear a row (blank patch values
      // are ignored server-side), so use Delete to remove a row instead.
      const metadata = rows
        .map((row) => {
          const value = row.value.trim();
          if (!value) {
            return null;
          }
          if (row.isNew) {
            const name = row.newName.trim();
            if (!name) {
              return { invalid: true };
            }
            return { field_name: name, value, ...(row.uuid ? { uuid: row.uuid } : {}) };
          }
          if (!row.field_id) {
            return { invalid: true };
          }
          return {
            lead_metadata_field_id: row.field_id,
            value,
            ...(row.uuid ? { uuid: row.uuid } : {}),
          };
        })
        .filter(Boolean) as Record<string, unknown>[];

      if (metadata.some((item) => (item as Record<string, unknown>).invalid)) {
        setError("Each metadata row needs a field (or a new field name) and a value.");
        return;
      }
      (payload as Record<string, unknown>).metadata = metadata;

      const envelope =
        mode === "create"
          ? await postEncrypted<Lead>(LEADS_API, payload)
          : await putEncrypted<Lead>(`${LEADS_API}/${uuid}`, payload);

      if (!envelope.success) {
        setError(envelope.message || `Failed to ${mode === "create" ? "create" : "update"} lead.`);
        return;
      }
      router.push(LEAD_LIST_PATH);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">
          {mode === "create" ? "New lead" : "Edit lead"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {mode === "create" ? "Create lead." : "Update lead."}
        </h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="Name" name="name" required minLength={2} defaultValue={initial?.name ?? ""} placeholder="Jane Doe" />
            <TextField label="Email" name="email" type="email" required defaultValue={initial?.email ?? ""} placeholder="jane@company.com" />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="Phone number" name="phone_number" required minLength={6} defaultValue={initial?.phone_number ?? ""} placeholder="+628123456789" />
            <TextField label="Company" name="company" defaultValue={initial?.company ?? ""} placeholder="Acme Inc" />
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <SelectField label="Source" name="source" defaultValue={initial?.source ?? "website"} options={SOURCE_OPTIONS} />
            {statuses.length > 0 ? (
              <SelectField
                label="Status"
                name="status"
                defaultValue={initial?.status ?? statuses[0]?.name ?? "new"}
                options={statuses.map((option) => ({ value: option.name, label: option.name }))}
              />
            ) : (
              <TextField label="Status" name="status" defaultValue={initial?.status ?? "new"} minLength={2} />
            )}
            <TextField
              label="Estimated deal value"
              name="value"
              type="number"
              min={0}
              step={1}
              defaultValue={typeof initial?.value === "number" ? initial.value : ""}
              placeholder="0"
            />
          </div>

          {statusesError ? (
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {statusesError}
            </p>
          ) : null}

          <SelectField
            label="Assigned to"
            name="assigned_to"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            disabled={assigneesLoading}
            options={assigneeItems.map((option) => ({
              value: option.uuid,
              label: `${option.name}${option.email ? ` (${option.email})` : ""}`,
            }))}
            placeholder={assigneesLoading ? "Loading users..." : "— Unassigned —"}
            hint="Only users in your organization are listed. Users without an organization see only unlinked users."
          />

          {assigneesError ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {assigneesError}
            </p>
          ) : null}

          <TextAreaField label="Notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} placeholder="Context about this lead..." />

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Leads metadata</h2>
                <p className="mt-0.5 text-xs text-slate-500">Pick a field from the dropdown or add a new one on the fly.</p>
                {fieldsError ? (
                  <p role="alert" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {fieldsError}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setRows((current) => [...current, newRow()])}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Add row
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {rows.map((row, index) => (
                <div key={row.key} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <SelectField
                      label={`Field #${index + 1}`}
                      value={row.isNew ? NEW_FIELD_VALUE : row.field_id}
                      onChange={(event) => {
                        const selected = event.target.value;
                        if (selected === NEW_FIELD_VALUE) {
                          updateRow(row.key, { isNew: true, field_id: "", newName: "" });
                        } else {
                          updateRow(row.key, { isNew: false, field_id: selected, newName: "" });
                        }
                      }}
                      options={[
                        ...fields.map((field) => ({ value: field.uuid, label: field.name })),
                        { value: NEW_FIELD_VALUE, label: "+ Add new field..." },
                      ]}
                      placeholder="Select field..."
                      labelClassName={rowLabelClass}
                      className={rowInputClass}
                    />
                    {row.isNew ? (
                      <div className="mt-2">
                        <TextField
                          value={row.newName}
                          onChange={(event) => updateRow(row.key, { newName: event.target.value })}
                          placeholder="New field name, e.g. Budget"
                          className={rowInputClass}
                        />
                      </div>
                    ) : null}
                  </div>
                  <TextField
                    label="Value"
                    value={row.value}
                    onChange={(event) => updateRow(row.key, { value: event.target.value })}
                    placeholder="Field value"
                    labelClassName={rowLabelClass}
                    className={rowValueInputClass}
                    action={
                      <AuthComponent
                        user={session.user}
                        permissions={session.permissions}
                        allowedPermissions={[UPLOAD_PERMISSION]}
                      >
                        <UploadButton
                          onUploaded={(url) => updateRow(row.key, { value: url })}
                          onError={setError}
                        />
                      </AuthComponent>
                    }
                  />
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      aria-label={`Remove metadata row ${index + 1}`}
                      className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {isPending ? "Saving..." : mode === "create" ? "Create lead" : "Save changes"}
            </button>
            <Link
              href={LEAD_LIST_PATH}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
