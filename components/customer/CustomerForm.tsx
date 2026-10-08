"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { CUSTOMER_LIST_PATH } from "@/app/sales/views/customers/paths";
import type { Customer } from "@/app/sales/models/CustomerModel";
import type { CustomerMetadata } from "@/app/sales/models/CustomerMetadataModel";
import type { CustomerMetadataField } from "@/app/sales/models/CustomerMetadataFieldModel";
import { AuthComponent } from "@/components/AuthComponent";
import { SelectField, TextAreaField, TextField } from "@/components/FormField";
import { UploadButton } from "@/components/UploadButton";
import type { SessionInfo } from "@/libraries/Auth";
import { getEncrypted, postEncrypted, putEncrypted } from "@/libraries/EncryptedFetch";

const API_PATH = "/sales/api/v1/customers";
const UPLOAD_PERMISSION = "base:tools:upload:upload";
const NEW_FIELD_VALUE = "__new__";

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

export type CustomerFormInitial = Partial<Pick<Customer, "name" | "email" | "phone" | "company_name" | "notes" | "status">> & {
  metadata?: Array<Pick<CustomerMetadata, "uuid" | "customer_metadata_field_id" | "value"> & { field_name?: string }>;
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

export function CustomerForm({
  mode,
  uuid,
  initial,
  session,
}: {
  mode: "create" | "edit";
  uuid?: string;
  initial?: CustomerFormInitial;
  session: SessionInfo;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [fields, setFields] = useState<CustomerMetadataField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const [fieldsError, setFieldsError] = useState("");
  const [rows, setRows] = useState<MetadataRow[]>(() => {
    if (initial?.metadata && initial.metadata.length > 0) {
      return initial.metadata.map((item, index) => ({
        key: item.uuid ?? `initial-${index}-${Math.random().toString(36).slice(2)}`,
        uuid: item.uuid,
        field_id: item.customer_metadata_field_id,
        value: item.value,
        isNew: false,
        newName: "",
      }));
    }
    return [];
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const envelope = await getEncrypted<CustomerMetadataField[]>(
          `/sales/api/v1/customer-metadata-fields?limit=100&sortProperty=name&sortDirection=asc`,
        );
        if (!active) {
          return;
        }
        if (!envelope.success) {
          setFieldsError(envelope.message || "Failed to load metadata fields. You can still add a new field manually.");
          return;
        }
        setFields((envelope.data ?? []).filter((row) => row.status !== "deleted"));
      } catch {
        if (active) {
          setFieldsError("Failed to load metadata fields. You can still add a new field manually.");
        }
      } finally {
        if (active) {
          setFieldsLoading(false);
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
    if (isPending || fieldsLoading) {
      return;
    }
    setError("");
    setIsPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      const payload: Record<string, unknown> = {
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        company_name: String(formData.get("company_name") ?? "").trim() || null,
        notes: String(formData.get("notes") ?? "").trim() || null,
        status: String(formData.get("status") ?? "active"),
      };

      // Omission = delete: full-replacement sync soft-deletes rows left out.
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
            customer_metadata_field_id: row.field_id,
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
      payload.metadata = metadata;

      const envelope =
        mode === "create"
          ? await postEncrypted<Customer>(API_PATH, payload)
          : await putEncrypted<Customer>(`${API_PATH}/${uuid}`, payload);

      if (!envelope.success) {
        setError(envelope.message || `Failed to ${mode === "create" ? "create" : "update"} customer.`);
        return;
      }
      router.push(CUSTOMER_LIST_PATH);
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
          {mode === "create" ? "New customer" : "Edit customer"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {mode === "create" ? "Create customer." : "Update customer."}
        </h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="Name" name="name" required minLength={2} defaultValue={initial?.name ?? ""} placeholder="Jane Doe" />
            <TextField label="Email" name="email" type="email" required defaultValue={initial?.email ?? ""} placeholder="jane@company.com" />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="Phone" name="phone" required minLength={6} defaultValue={initial?.phone ?? ""} placeholder="+628123456789" />
            <TextField label="Company" name="company_name" defaultValue={initial?.company_name ?? ""} placeholder="Acme Inc" />
          </div>

          <SelectField
            label="Status"
            name="status"
            defaultValue={initial?.status ?? "active"}
            options={[
              { value: "active", label: "active" },
              { value: "inactive", label: "inactive" },
            ]}
          />

          <TextAreaField label="Notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} placeholder="Context about this customer..." />

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Customer metadata</h2>
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
                      placeholder={fieldsLoading ? "Loading fields..." : "Select field..."}
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
              disabled={isPending || fieldsLoading}
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {isPending ? "Saving..." : mode === "create" ? "Create customer" : "Save changes"}
            </button>
            <Link
              href={CUSTOMER_LIST_PATH}
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
