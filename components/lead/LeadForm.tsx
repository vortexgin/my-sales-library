"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { LEAD_LIST_PATH } from "@/app/sales/views/leads/paths";
import type { Lead } from "@/app/sales/models/LeadModel";
import type { LeadMetadata } from "@/app/sales/models/LeadMetadataModel";
import type { LeadMetadataField } from "@/app/sales/models/LeadMetadataFieldModel";
import type { LeadStatus } from "@/app/sales/models/LeadStatusModel";
import type { User } from "@/app/base/models/UserModel";
import { getEncrypted, postEncrypted, putEncrypted } from "@/libraries/EncryptedFetch";

const LEADS_API = "/sales/api/v1/leads";
const USERS_API = "/base/api/v1/users";
const UPLOAD_API = "/base/api/v1/tools/upload-file";
const NEW_FIELD_VALUE = "__new__";
const CLIENT_MAX_FILE_BYTES = 10 * 1024 * 1024;

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

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
}: {
  mode: "create" | "edit";
  uuid?: string;
  initial?: LeadFormInitial;
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadTargetKey, setUploadTargetKey] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [rows, setRows] = useState<MetadataRow[]>(() => {
    if (initial?.metadata && initial.metadata.length > 0) {
      return initial.metadata.map((item) => ({
        key: item.uuid,
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
        const [statusEnvelope, fieldEnvelope, userEnvelope] = await Promise.all([
          getEncrypted<LeadStatus[]>(`/sales/api/v1/lead-statuses?limit=500&sortProperty=name&sortDirection=asc`),
          getEncrypted<LeadMetadataField[]>(`/sales/api/v1/lead-metadata-fields?limit=500&sortProperty=name&sortDirection=asc`),
          getEncrypted<User[]>(`${USERS_API}?sortProperty=name&sortDirection=asc&limit=100&filter[org_scope]=actor`),
        ]);
        if (!active) {
          return;
        }
        if (statusEnvelope.success) {
          setStatuses((statusEnvelope.data ?? []).filter((row) => row.status !== "deleted"));
        }
        if (fieldEnvelope.success) {
          setFields((fieldEnvelope.data ?? []).filter((row) => row.status !== "deleted"));
        }
        if (!userEnvelope.success) {
          setAssigneesError(userEnvelope.message || "Failed to load users.");
          return;
        }
        setAssignees(userEnvelope.data ?? []);
      } catch {
        if (active) {
          setAssigneesError("Failed to load users. Please try again.");
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
    setRows((current) => (current.length <= 1 ? current : current.filter((row) => row.key !== key)));
  }

  function readAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
      reader.readAsDataURL(file);
    });
  }

  function pickFile(key: string) {
    setUploadTargetKey(key);
    fileInputRef.current?.click();
  }

  async function handleFilePicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so picking the same file twice still fires onChange.
    event.target.value = "";
    const target = uploadTargetKey;
    setUploadTargetKey(null);
    if (!file || !target) {
      return;
    }
    if (file.size > CLIENT_MAX_FILE_BYTES) {
      setError(`File exceeds the ${CLIENT_MAX_FILE_BYTES} byte limit.`);
      return;
    }
    setUploadingKey(target);
    setError("");
    try {
      const data = await readAsBase64(file);
      const envelope = await postEncrypted<{ key: string; url: string }>(UPLOAD_API, {
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        data,
      });
      if (!envelope.success) {
        throw new Error(envelope.message || "Failed to upload file.");
      }
      updateRow(target, { value: envelope.data.url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file. Please try again.");
    } finally {
      setUploadingKey(null);
    }
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
        setIsPending(false);
        return;
      }

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
        setIsPending(false);
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
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Name</span>
              <input type="text" name="name" required minLength={2} defaultValue={initial?.name ?? ""} placeholder="Jane Doe" className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
              <input type="email" name="email" required defaultValue={initial?.email ?? ""} placeholder="jane@company.com" className={inputClass} />
            </label>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Phone number</span>
              <input type="text" name="phone_number" required minLength={6} defaultValue={initial?.phone_number ?? ""} placeholder="+628123456789" className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Company</span>
              <input type="text" name="company" defaultValue={initial?.company ?? ""} placeholder="Acme Inc" className={inputClass} />
            </label>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Source</span>
              <select name="source" defaultValue={initial?.source ?? "website"} className={inputClass}>
                <option value="website">website</option>
                <option value="referral">referral</option>
                <option value="ads">ads</option>
                <option value="cold_call">cold_call</option>
                <option value="event">event</option>
                <option value="other">other</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Status</span>
              {statuses.length > 0 ? (
                <select name="status" defaultValue={initial?.status ?? statuses[0]?.name ?? "new"} className={inputClass}>
                  {statuses.map((option) => (
                    <option key={option.uuid} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input type="text" name="status" defaultValue={initial?.status ?? "new"} minLength={2} className={inputClass} />
              )}
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Estimated deal value</span>
              <input
                type="number"
                name="value"
                min={0}
                step={1}
                defaultValue={typeof initial?.value === "number" ? initial.value : ""}
                placeholder="0"
                className={inputClass}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Assigned to</span>
            <select
              name="assigned_to"
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              disabled={assigneesLoading}
              className={inputClass}
            >
              <option value="">
                {assigneesLoading ? "Loading users..." : "— Unassigned —"}
              </option>
              {assigneeItems.map((option) => (
                <option key={option.uuid} value={option.uuid}>
                  {option.name}{option.email ? ` (${option.email})` : ""}
                </option>
              ))}
            </select>
            <span className="mt-2 block text-xs text-slate-500">
              Only users in your organization are listed. Users without an organization see only unlinked users.
            </span>
          </label>

          {assigneesError ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {assigneesError}
            </p>
          ) : null}

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Notes</span>
            <textarea name="notes" rows={3} defaultValue={initial?.notes ?? ""} placeholder="Context about this lead..." className={inputClass} />
          </label>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Leads metadata</h2>
                <p className="mt-0.5 text-xs text-slate-500">Pick a field from the dropdown or add a new one on the fly.</p>
              </div>
              <button
                type="button"
                onClick={() => setRows((current) => [...current, newRow()])}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Add row
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              aria-hidden
              tabIndex={-1}
              onChange={handleFilePicked}
            />
            <div className="mt-4 space-y-3">
              {rows.map((row, index) => (
                <div key={row.key} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Field #{index + 1}</span>
                    <select
                      value={row.isNew ? NEW_FIELD_VALUE : row.field_id}
                      onChange={(event) => {
                        const selected = event.target.value;
                        if (selected === NEW_FIELD_VALUE) {
                          updateRow(row.key, { isNew: true, field_id: "", newName: "" });
                        } else {
                          updateRow(row.key, { isNew: false, field_id: selected, newName: "" });
                        }
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                    >
                      <option value="">Select field...</option>
                      {fields.map((field) => (
                        <option key={field.uuid} value={field.uuid}>
                          {field.name}
                        </option>
                      ))}
                      <option value={NEW_FIELD_VALUE}>+ Add new field...</option>
                    </select>
                    {row.isNew ? (
                      <input
                        type="text"
                        value={row.newName}
                        onChange={(event) => updateRow(row.key, { newName: event.target.value })}
                        placeholder="New field name, e.g. Budget"
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                      />
                    ) : null}
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Value</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={row.value}
                        onChange={(event) => updateRow(row.key, { value: event.target.value })}
                        placeholder="Field value"
                        className="w-full min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => pickFile(row.key)}
                        disabled={uploadingKey !== null}
                        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {uploadingKey === row.key ? "Uploading..." : "File"}
                      </button>
                    </div>
                  </label>
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
