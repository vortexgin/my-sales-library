"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LEAD_METADATA_FIELD_LIST_PATH } from "@/app/sales/views/lead-metadata-fields/paths";
import type { LeadMetadataField } from "@/app/sales/models/LeadMetadataFieldModel";
import { postEncrypted, putEncrypted } from "@/libraries/EncryptedFetch";

const API_PATH = "/sales/api/v1/lead-metadata-fields";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

export function LeadMetadataFieldForm({
  mode,
  uuid,
  initial,
}: {
  mode: "create" | "edit";
  uuid?: string;
  initial?: Pick<LeadMetadataField, "name" | "description" | "status">;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsPending(true);

    try {
      const formData = new FormData(event.currentTarget);
      const payload: Record<string, unknown> = {
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        status: String(formData.get("status") ?? "active"),
      };

      const envelope =
        mode === "create"
          ? await postEncrypted<LeadMetadataField>(API_PATH, payload)
          : await putEncrypted<LeadMetadataField>(`${API_PATH}/${uuid}`, payload);

      if (!envelope.success) {
        setError(envelope.message || `Failed to ${mode === "create" ? "create" : "update"} lead metadata field.`);
        return;
      }

      router.push(LEAD_METADATA_FIELD_LIST_PATH);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">
          {mode === "create" ? "New lead metadata field" : "Edit lead metadata field"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {mode === "create" ? "Create lead metadata field." : "Update lead metadata field."}
        </h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Name</span>
            <input
              type="text"
              name="name"
              required
              minLength={2}
              defaultValue={initial?.name ?? ""}
              placeholder="e.g. Budget range"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Description</span>
            <textarea
              name="description"
              required
              minLength={2}
              rows={3}
              defaultValue={initial?.description ?? ""}
              placeholder="e.g. Prospect declared budget bracket"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">Status</span>
            <select name="status" defaultValue={initial?.status ?? "active"} className={inputClass}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>

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
              {isPending ? "Saving..." : mode === "create" ? "Create lead metadata field" : "Save changes"}
            </button>
            <Link
              href={LEAD_METADATA_FIELD_LIST_PATH}
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
