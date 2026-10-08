"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { CustomerActivity } from "@/app/sales/models/CustomerActivityModel";
import { AuthComponent } from "@/components/AuthComponent";
import { SelectField, TextAreaField, TextField } from "@/components/FormField";
import { UploadButton } from "@/components/UploadButton";
import type { SessionInfo } from "@/libraries/Auth";
import { getEncrypted, postEncrypted } from "@/libraries/EncryptedFetch";

const UPLOAD_PERMISSION = "base:tools:upload:upload";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

export function CustomerActivityModal({
  customerUuid,
  session,
  open,
  onClose,
  onCreated,
}: {
  customerUuid: string;
  session: SessionInfo;
  open: boolean;
  onClose: () => void;
  onCreated: (activity: CustomerActivity) => void;
}) {
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState("");

  // Portalled to document.body: ancestor cards use backdrop-blur, which
  // creates a containing block that would otherwise trap this fixed overlay.
  if (!open || typeof document === "undefined") {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }
    setError("");
    setIsPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      const payload: Record<string, unknown> = {
        customer_id: customerUuid,
        type: String(formData.get("type") ?? "call"),
        subject: String(formData.get("subject") ?? "").trim(),
        body: String(formData.get("body") ?? "").trim(),
        occurred_at: new Date(String(formData.get("occurred_at") ?? "")).toISOString(),
        attachment_url: attachmentUrl.trim() || null,
      };

      const envelope = await postEncrypted<CustomerActivity>("/sales/api/v1/customer-activities", payload);
      if (!envelope.success) {
        setError(envelope.message || "Failed to create activity.");
        return;
      }
      onCreated(envelope.data as CustomerActivity);
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Create customer activity">
      <div className="absolute inset-0 bg-slate-950/50" onClick={onClose} aria-hidden />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-900">Create activity.</h2>
        <p className="mt-1 text-sm text-slate-500">Log a call, email, or meeting for this customer.</p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <SelectField
            label="Type"
            name="type"
            defaultValue="call"
            options={[
              { value: "call", label: "call" },
              { value: "email", label: "email" },
              { value: "meeting", label: "meeting" },
              { value: "other", label: "other" },
            ]}
          />
          <TextField label="Subject" name="subject" required minLength={2} placeholder="Follow-up call" className={inputClass} />
          <TextAreaField label="Body" name="body" required minLength={2} rows={3} placeholder="What was discussed?" className={inputClass} />
          <TextField label="Occurred at" name="occurred_at" type="datetime-local" required className={inputClass} />
          <TextField
            label="Attachment URL (optional)"
            value={attachmentUrl}
            onChange={(event) => setAttachmentUrl(event.target.value)}
            placeholder="https://..."
            className={inputClass}
            action={
              <AuthComponent
                user={session.user}
                permissions={session.permissions}
                allowedPermissions={[UPLOAD_PERMISSION]}
              >
                <UploadButton
                  onUploaded={(url) => setAttachmentUrl(url)}
                  onError={setError}
                />
              </AuthComponent>
            }
          />
          {error ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:bg-slate-500"
            >
              {isPending ? "Saving..." : "Create activity"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

export function CustomerActivitySection({
  customerUuid,
  session,
  canCreate,
}: {
  customerUuid: string;
  session: SessionInfo;
  canCreate: boolean;
}) {
  const [activities, setActivities] = useState<CustomerActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          "filter[customer_id]": customerUuid,
          sortProperty: "occurred_at",
          sortDirection: "desc",
          limit: "100",
        });
        const envelope = await getEncrypted<CustomerActivity[]>(`/sales/api/v1/customer-activities?${params.toString()}`);
        if (!active) {
          return;
        }
        if (!envelope.success) {
          setError(envelope.message || "Failed to fetch activities.");
          return;
        }
        setActivities(envelope.data ?? []);
      } catch {
        if (active) {
          setError("Failed to fetch activities.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [customerUuid]);

  return (
    <div className="mt-6 rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Activities</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">Customer activities.</h2>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Create activity
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading activities...</p>
      ) : error ? (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : activities.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No activities yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {activities.map((activity) => (
            <li key={activity.uuid} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {activity.type}
                </span>
                <span className="text-sm font-semibold text-slate-900">{activity.subject}</span>
                <span className="text-xs text-slate-500">{new Date(activity.occurred_at).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-sm text-slate-700">{activity.body}</p>
              {activity.attachment_url ? (
                <a href={activity.attachment_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-blue-600 hover:text-blue-500">
                  {activity.attachment_url}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <CustomerActivityModal
        customerUuid={customerUuid}
        session={session}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(created) => setActivities((current) => [created, ...current])}
      />
    </div>
  );
}
