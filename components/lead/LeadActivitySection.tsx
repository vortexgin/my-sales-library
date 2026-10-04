"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { LeadActivity } from "@/app/sales/models/LeadActivityModel";
import { getEncrypted, postEncrypted } from "@/libraries/EncryptedFetch";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

export function LeadActivityModal({
  leadUuid,
  open,
  onClose,
  onCreated,
}: {
  leadUuid: string;
  open: boolean;
  onClose: () => void;
  onCreated: (activity: LeadActivity) => void;
}) {
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  // Portalled to document.body: ancestor cards use backdrop-blur, which
  // creates a containing block that would otherwise trap this fixed overlay
  // behind the activity container.
  if (!open || typeof document === "undefined") {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      const payload: Record<string, unknown> = {
        leads_id: leadUuid,
        pic: String(formData.get("pic") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim(),
        email: String(formData.get("email") ?? "").trim(),
        meeting_start: new Date(String(formData.get("meeting_start") ?? "")).toISOString(),
        notes: String(formData.get("notes") ?? "").trim(),
      };
      const endRaw = String(formData.get("meeting_end") ?? "").trim();
      if (endRaw) {
        payload.meeting_end = new Date(endRaw).toISOString();
      }
      const attachment = String(formData.get("attachment") ?? "").trim();
      if (attachment) {
        payload.attachment = attachment;
      }

      const envelope = await postEncrypted<LeadActivity>("/sales/api/v1/lead-activities", payload);
      if (!envelope.success) {
        setError(envelope.message || "Failed to create activity.");
        return;
      }
      onCreated(envelope.data as LeadActivity);
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Create lead activity">
      <div className="absolute inset-0 bg-slate-950/50" onClick={onClose} aria-hidden />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-900">Create activity.</h2>
        <p className="mt-1 text-sm text-slate-500">Log a call, visit, or meeting for this lead.</p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">PIC</span>
            <input type="text" name="pic" required minLength={2} placeholder="Person in charge" className={inputClass} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Phone</span>
              <input type="text" name="phone" required minLength={6} placeholder="+628..." className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
              <input type="email" name="email" required placeholder="pic@company.com" className={inputClass} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Meeting start</span>
              <input type="datetime-local" name="meeting_start" required className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Meeting end (optional)</span>
              <input type="datetime-local" name="meeting_end" className={inputClass} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Notes</span>
            <textarea name="notes" required minLength={2} rows={3} placeholder="What was discussed?" className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Attachment URL (optional)</span>
            <input type="text" name="attachment" placeholder="https://..." className={inputClass} />
          </label>
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

export function LeadActivitySection({
  leadUuid,
  canCreate,
  onActivities,
}: {
  leadUuid: string;
  canCreate: boolean;
  onActivities?: (activities: LeadActivity[]) => void;
}) {
  const [activities, setActivities] = useState<LeadActivity[]>([]);
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
          "filter[leads_id]": leadUuid,
          sortProperty: "meeting_start",
          sortDirection: "desc",
          limit: "100",
        });
        const envelope = await getEncrypted<LeadActivity[]>(`/sales/api/v1/lead-activities?${params.toString()}`);
        if (!active) {
          return;
        }
        if (!envelope.success) {
          setError(envelope.message || "Failed to fetch activities.");
          return;
        }
        const rows = envelope.data ?? [];
        setActivities(rows);
        onActivities?.(rows);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadUuid]);

  return (
    <div className="mt-6 rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Activities</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">Lead activities.</h2>
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
                <span className="text-sm font-semibold text-slate-900">{activity.pic}</span>
                <span className="text-xs text-slate-500">{new Date(activity.meeting_start).toLocaleString()}</span>
                {activity.meeting_end ? (
                  <span className="text-xs text-slate-500">→ {new Date(activity.meeting_end).toLocaleString()}</span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-slate-700">{activity.notes}</p>
              <p className="mt-1 text-xs text-slate-500">
                {activity.email} · {activity.phone}
              </p>
            </li>
          ))}
        </ul>
      )}

      <LeadActivityModal
        leadUuid={leadUuid}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(created) => {
          const next = [created, ...activities];
          setActivities(next);
          onActivities?.(next);
        }}
      />
    </div>
  );
}
