"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { Lead } from "@/app/sales/models/LeadModel";
import type { LeadStatus } from "@/app/sales/models/LeadStatusModel";
import type { User } from "@/app/base/models/UserModel";
import type { SessionInfo } from "@/libraries/Auth";
import { hasPermission } from "@/libraries/Permissions";
import { getEncrypted, putEncrypted } from "@/libraries/EncryptedFetch";
import {
  deleteBoardView,
  EMPTY_BOARD_FILTERS,
  filtersFromSearchParams,
  filtersToSearchParams,
  loadBoardViews,
  saveBoardView,
  type BoardFilters,
  type SavedBoardView,
} from "@/app/sales/components/lead/LeadFilterViews";

const LEADS_API = "/sales/api/v1/leads";
const STATUS_API = "/sales/api/v1/lead-statuses";
const USERS_API = "/base/api/v1/users";

const SOURCE_OPTIONS = ["website", "referral", "ads", "cold_call", "event", "other"];
const STALE_OPTIONS = [
  { value: "", label: "Any recency" },
  { value: "7", label: "Stale > 7d" },
  { value: "14", label: "Stale > 14d" },
  { value: "30", label: "Stale > 30d" },
];

async function fetchStatuses(): Promise<LeadStatus[]> {
  const params = new URLSearchParams({ limit: "500", sortProperty: "weight", sortDirection: "asc" });
  const envelope = await getEncrypted<LeadStatus[]>(`${STATUS_API}?${params.toString()}`);
  if (!envelope.success) {
    throw new Error(envelope.message || "Failed to fetch lead statuses.");
  }
  return (envelope.data ?? []).filter((row) => row.status !== "deleted");
}

async function fetchLeads(filters: BoardFilters): Promise<Lead[]> {
  const params = new URLSearchParams({ limit: "500", sortProperty: "created_at", sortDirection: "desc" });
  if (filters.q.trim()) {
    params.set("filter[q]", filters.q.trim());
  }
  if (filters.source) {
    params.set("filter[source]", filters.source);
  }
  if (filters.assigned === "specific" && filters.assignedTo) {
    params.set("filter[assigned_to]", filters.assignedTo);
  } else if (filters.assigned === "me" || filters.assigned === "unassigned") {
    params.set("filter[assigned]", filters.assigned);
  }
  if (filters.valueMin.trim()) {
    params.set("filter[value_min]", filters.valueMin.trim());
  }
  if (filters.valueMax.trim()) {
    params.set("filter[value_max]", filters.valueMax.trim());
  }
  if (filters.staleDays) {
    params.set("filter[stale_days]", filters.staleDays);
  }
  const envelope = await getEncrypted<Lead[]>(`${LEADS_API}?${params.toString()}`);
  if (!envelope.success) {
    throw new Error(envelope.message || "Failed to fetch leads.");
  }
  return (envelope.data ?? []).filter((lead) => lead.status?.toLowerCase() !== "deleted");
}

export function LeadBoard({ session }: { session: SessionInfo }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [statuses, setStatuses] = useState<LeadStatus[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moveError, setMoveError] = useState("");
  const [drafts, setDrafts] = useState<BoardFilters>(() => ({
    ...EMPTY_BOARD_FILTERS,
    ...filtersFromSearchParams(searchParams),
  }));
  const [applied, setApplied] = useState<BoardFilters>(() => ({
    ...EMPTY_BOARD_FILTERS,
    ...filtersFromSearchParams(searchParams),
  }));
  const [views, setViews] = useState<SavedBoardView[]>(() => loadBoardViews());
  const [viewName, setViewName] = useState("");
  // Mount timestamp captured once: computing it in render would be impure.
  const [mountedAt] = useState(() => Date.now());
  const [dragUuid, setDragUuid] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [finalPopup, setFinalPopup] = useState<{ lead: Lead; finalName: string } | null>(null);

  const canUpdate = hasPermission(session.user, session.permissions, ["sales:lead:view:update"]);
  const canCreate = hasPermission(session.user, session.permissions, ["sales:lead:create:create"]);

  const load = useCallback(async (filters: BoardFilters) => {
    setLoading(true);
    setError("");
    // Independent fetches: a statuses outage must not discard leads
    // the user is authorized to see (and vice versa).
    const [statusResult, leadResult] = await Promise.allSettled([fetchStatuses(), fetchLeads(filters)]);
    if (statusResult.status === "fulfilled") {
      setStatuses(statusResult.value);
    } else {
      const reason = statusResult.reason instanceof Error ? statusResult.reason.message : "Failed to fetch lead statuses.";
      setStatuses([]);
      setError(`Lead statuses unavailable: ${reason} Showing all leads under Other.`);
    }
    if (leadResult.status === "fulfilled") {
      setLeads(leadResult.value);
    } else {
      setLeads([]);
      setError(leadResult.reason instanceof Error ? leadResult.reason.message : "Failed to fetch leads.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(applied);
  }, [applied, load]);

  useEffect(() => {
    let active = true;
    // Assignee picker degrades silently: me/unassigned/all keep working.
    (async () => {
      try {
        const envelope = await getEncrypted<User[]>(
          `${USERS_API}?sortProperty=name&sortDirection=asc&limit=100&filter[org_scope]=actor`,
        );
        if (active && envelope.success) {
          setUsers(envelope.data ?? []);
        }
      } catch {
        // Users dropdown stays limited to me/unassigned/all.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function syncUrl(filters: BoardFilters) {
    const query = filtersToSearchParams(filters).toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function setDraft<K extends keyof BoardFilters>(key: K, value: BoardFilters[K]) {
    setDrafts((current) => ({ ...current, [key]: value }));
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied({ ...drafts });
    syncUrl(drafts);
  }

  function resetFilters() {
    setDrafts({ ...EMPTY_BOARD_FILTERS });
    setApplied({ ...EMPTY_BOARD_FILTERS });
    syncUrl(EMPTY_BOARD_FILTERS);
  }

  function applyView(name: string) {
    const view = views.find((entry) => entry.name === name);
    if (!view) {
      return;
    }
    setDrafts({ ...view.filters });
    setApplied({ ...view.filters });
    syncUrl(view.filters);
  }

  function handleSaveView() {
    const name = viewName.trim();
    if (!name) {
      return;
    }
    setViews(saveBoardView(name, drafts));
    setViewName("");
  }

  function handleDeleteView(name: string) {
    setViews(deleteBoardView(name));
  }

  async function moveLead(leadUuid: string, targetStatus: string) {
    const previous = leads;
    setLeads((current) =>
      current.map((lead) => (lead.uuid === leadUuid ? { ...lead, status: targetStatus } : lead)),
    );
    setMoveError("");
    try {
      const envelope = await putEncrypted<Lead>(`${LEADS_API}/${leadUuid}`, { status: targetStatus });
      if (!envelope.success) {
        throw new Error(envelope.message || "Failed to update lead status.");
      }
      if (envelope.data) {
        setLeads((current) =>
          current.map((lead) => (lead.uuid === leadUuid ? (envelope.data as Lead) : lead)),
        );
      }
      // Dropped onto a final stage: offer next steps. The move itself
      // already persisted; Do nothing simply closes the popup.
      const target = statuses.find((status) => status.name === targetStatus);
      if (target?.is_final) {
        const moved = (envelope.data as Lead | undefined) ?? previous.find((lead) => lead.uuid === leadUuid);
        if (moved) {
          setFinalPopup({ lead: { ...moved, status: targetStatus }, finalName: targetStatus });
        }
      }
    } catch (err) {
      setLeads(previous);
      setMoveError(err instanceof Error ? err.message : "Failed to move lead.");
    }
  }

  const columns = useMemo(() => {
    const ordered = [...statuses].sort(
      (a, b) => (a.weight ?? 0) - (b.weight ?? 0) || a.created_at.localeCompare(b.created_at),
    );
    const grouped = ordered.map((status) => {
      const rows = leads.filter((lead) => lead.status === status.name);
      return {
        key: status.name,
        title: status.name,
        description: status.description,
        isFinal: status.is_final,
        leads: rows,
        total: rows.reduce((sum, lead) => sum + (typeof lead.value === "number" ? lead.value : 0), 0),
      };
    });
    const unmapped = leads.filter((lead) => !statuses.some((status) => status.name === lead.status));
    if (unmapped.length > 0) {
      grouped.push({
        key: "__other__",
        title: "Other",
        description: "Status not in master data.",
        isFinal: false,
        leads: unmapped,
        total: unmapped.reduce((sum, lead) => sum + (typeof lead.value === "number" ? lead.value : 0), 0),
      });
    }
    return grouped;
  }, [statuses, leads]);

  // Stale threshold follows the Recency filter, defaulting to 7 days.
  const staleCutoff = useMemo(() => {
    const days = Number(applied.staleDays) || 7;
    return mountedAt - days * 86400e3;
  }, [applied.staleDays, mountedAt]);

  function isStale(lead: Lead): boolean {
    return new Date(lead.updated_at).getTime() < staleCutoff;
  }

  return (
    <div>
      <form onSubmit={applyFilters} className="mt-6 space-y-3">
        <div className="flex flex-row gap-3">
          <input
            type="search"
            value={drafts.q}
            onChange={(event) => setDraft("q", event.target.value)}
            placeholder="Search name, email, phone, company..."
            aria-label="Search leads"
            className="w-full flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <div className="flex shrink-0 gap-2">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Filter
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Reset
            </button>
            {canCreate ? (
              <>
                <Link
                  href="/sales/views/leads/create"
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
                >
                  New lead
                </Link>
                <Link
                  href="/sales/views/leads/import"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Import
                </Link>
              </>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Source</span>
            <select
              value={drafts.source}
              onChange={(event) => setDraft("source", event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:bg-white focus:border-blue-500"
            >
              <option value="">All sources</option>
              {SOURCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Assigned</span>
            <select
              value={drafts.assigned}
              onChange={(event) => {
                const mode = event.target.value;
                setDrafts((current) => ({
                  ...current,
                  assigned: mode,
                  assignedTo: mode === "specific" ? current.assignedTo : "",
                }));
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:bg-white focus:border-blue-500"
            >
              <option value="all">Everyone</option>
              <option value="me">Mine</option>
              <option value="unassigned">Unassigned</option>
              <option value="specific">Specific user…</option>
            </select>
          </label>
          {drafts.assigned === "specific" ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">User</span>
              <select
                value={drafts.assignedTo}
                onChange={(event) => setDraft("assignedTo", event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:bg-white focus:border-blue-500"
              >
                <option value="">Select user…</option>
                {users.map((option) => (
                  <option key={option.uuid} value={option.uuid}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Min value</span>
            <input
              type="number"
              min={0}
              step={1}
              value={drafts.valueMin}
              onChange={(event) => setDraft("valueMin", event.target.value)}
              placeholder="0"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:bg-white focus:border-blue-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Max value</span>
            <input
              type="number"
              min={0}
              step={1}
              value={drafts.valueMax}
              onChange={(event) => setDraft("valueMax", event.target.value)}
              placeholder="No max"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:bg-white focus:border-blue-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Recency</span>
            <select
              value={drafts.staleDays}
              onChange={(event) => setDraft("staleDays", event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:bg-white focus:border-blue-500"
            >
              {STALE_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Saved views"
            value=""
            onChange={(event) => {
              if (event.target.value) {
                applyView(event.target.value);
                event.target.value = "";
              }
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500"
          >
            <option value="">Saved views…</option>
            {views.map((view) => (
              <option key={view.name} value={view.name}>
                {view.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={viewName}
            onChange={(event) => setViewName(event.target.value)}
            placeholder="View name…"
            aria-label="Saved view name"
            className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500"
          />
          <button
            type="button"
            onClick={handleSaveView}
            disabled={!viewName.trim()}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save view
          </button>
          {views.length > 0 ? (
            <select
              aria-label="Delete saved view"
              value=""
              onChange={(event) => {
                if (event.target.value && window.confirm(`Delete view "${event.target.value}"?`)) {
                  handleDeleteView(event.target.value);
                }
                event.target.value = "";
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 outline-none transition focus:border-blue-500"
            >
              <option value="">Delete view…</option>
              {views.map((view) => (
                <option key={view.name} value={view.name}>
                  {view.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </form>

      {error ? (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {moveError ? (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {moveError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading board...</p>
      ) : columns.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          No lead statuses found for your organization. Ask an admin to add master statuses first.
        </p>
      ) : (
        <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <section
              key={column.key}
              aria-label={`${column.title} column`}
              onDragOver={canUpdate ? (event) => {
                event.preventDefault();
                setDropTarget(column.key);
              } : undefined}
              onDragLeave={canUpdate ? () => setDropTarget((current) => (current === column.key ? null : current)) : undefined}
              onDrop={canUpdate ? (event) => {
                event.preventDefault();
                setDropTarget(null);
                const uuid = event.dataTransfer.getData("text/lead-uuid") || dragUuid;
                if (uuid && column.key !== "__other__") {
                  const current = leads.find((lead) => lead.uuid === uuid);
                  if (current && current.status !== column.key) {
                    moveLead(uuid, column.key);
                  }
                }
                setDragUuid(null);
              } : undefined}
              className={`flex w-72 shrink-0 flex-col rounded-2xl border p-3 transition ${
                dropTarget === column.key
                  ? "border-blue-400 bg-slate-50/80 ring-4 ring-blue-100"
                  : "isFinal" in column && column.isFinal
                    ? "border-emerald-300 bg-emerald-50/60 ring-1 ring-inset ring-emerald-200"
                    : "border-slate-200 bg-slate-50/80"
              }`}
            >
              <header className="px-1 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">
                    {column.title}
                    {"isFinal" in column && column.isFinal ? (
                      <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        final
                      </span>
                    ) : null}
                  </h2>
                  <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {column.leads.length} · {column.total}
                  </span>
                </div>
                {column.description ? (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{column.description}</p>
                ) : null}
              </header>
              <div className="flex flex-1 flex-col gap-2">
                {column.leads.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-4 text-center text-xs text-slate-400">
                    Drop leads here
                  </p>
                ) : (
                  column.leads.map((lead) => (
                    <article
                      key={lead.uuid}
                      draggable={canUpdate && column.key !== "__other__"}
                      onDragStart={canUpdate ? (event) => {
                        event.dataTransfer.setData("text/lead-uuid", lead.uuid);
                        event.dataTransfer.effectAllowed = "move";
                        setDragUuid(lead.uuid);
                      } : undefined}
                      onDragEnd={canUpdate ? () => {
                        setDragUuid(null);
                        setDropTarget(null);
                      } : undefined}
                      className={`rounded-xl border bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow ${
                        dragUuid === lead.uuid ? "opacity-50" : ""
                      } ${canUpdate ? "cursor-grab active:cursor-grabbing" : ""} ${
                        !lead.assigned_to ? "ring-2 ring-amber-200" : "border-slate-200"
                      }`}
                    >
                      <Link href={`/sales/views/leads/${lead.uuid}`} className="block">
                        <p className="font-medium text-slate-900 hover:text-blue-600">{lead.name}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{lead.company || lead.email}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{lead.phone_number}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            {lead.source}
                          </span>
                          {typeof lead.value === "number" ? (
                            <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                              {lead.value}
                            </span>
                          ) : null}
                          {!lead.assigned_to ? (
                            <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                              Unassigned
                            </span>
                          ) : null}
                          {isStale(lead) ? (
                            <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-200">
                              Stale
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    </article>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
      {!canUpdate && !loading ? (
        <p className="mt-4 text-xs text-slate-400">You have read-only access: dragging between statuses is disabled.</p>
      ) : null}
      {finalPopup && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Lead reached final stage">
              <div className="absolute inset-0 bg-slate-950/50" onClick={() => setFinalPopup(null)} aria-hidden />
              <div className="relative w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-6 shadow-2xl">
                <h2 className="text-lg font-semibold text-slate-900">Final stage.</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {finalPopup.lead.name} is now {finalPopup.finalName}. What next?
                </p>
                <div className="mt-4 space-y-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    Create running invoice — unavailable: invoice creation lives in the sass module.
                  </div>
                  <Link
                    href="/sales/views/purchase-requests/create"
                    className="block rounded-xl bg-slate-950 px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    Create purchase request
                  </Link>
                  <button
                    type="button"
                    onClick={() => setFinalPopup(null)}
                    className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Do nothing
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
