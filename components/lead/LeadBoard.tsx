"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Lead } from "@/app/sales/models/LeadModel";
import type { LeadStatus } from "@/app/sales/models/LeadStatusModel";
import type { SessionInfo } from "@/libraries/Auth";
import { hasPermission } from "@/libraries/Permissions";
import { getEncrypted, putEncrypted } from "@/libraries/EncryptedFetch";

const LEADS_API = "/sales/api/v1/leads";
const STATUS_API = "/sales/api/v1/lead-statuses";

async function fetchStatuses(): Promise<LeadStatus[]> {
  const params = new URLSearchParams({ limit: "500", sortProperty: "created_at", sortDirection: "asc" });
  const envelope = await getEncrypted<LeadStatus[]>(`${STATUS_API}?${params.toString()}`);
  if (!envelope.success) {
    throw new Error(envelope.message || "Failed to fetch lead statuses.");
  }
  return (envelope.data ?? []).filter((row) => row.status !== "deleted");
}

async function fetchLeads(keyword: string): Promise<Lead[]> {
  const params = new URLSearchParams({ limit: "500", sortProperty: "created_at", sortDirection: "desc" });
  if (keyword) {
    params.set("filter[q]", keyword);
  }
  const envelope = await getEncrypted<Lead[]>(`${LEADS_API}?${params.toString()}`);
  if (!envelope.success) {
    throw new Error(envelope.message || "Failed to fetch leads.");
  }
  return (envelope.data ?? []).filter((lead) => lead.status?.toLowerCase() !== "deleted");
}

export function LeadBoard({ session }: { session: SessionInfo }) {
  const [statuses, setStatuses] = useState<LeadStatus[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moveError, setMoveError] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [dragUuid, setDragUuid] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const canUpdate = hasPermission(session.user, session.permissions, ["sales:lead:view:update"]);
  const canCreate = hasPermission(session.user, session.permissions, ["sales:lead:create:create"]);

  const load = useCallback(async (keyword: string) => {
    setLoading(true);
    setError("");
    // Independent fetches: a statuses outage must not discard leads
    // the user is authorized to see (and vice versa).
    const [statusResult, leadResult] = await Promise.allSettled([fetchStatuses(), fetchLeads(keyword)]);
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
    load(appliedQ);
  }, [appliedQ, load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedQ(draftQ.trim());
  }

  function resetFilters() {
    setDraftQ("");
    setAppliedQ("");
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
    } catch (err) {
      setLeads(previous);
      setMoveError(err instanceof Error ? err.message : "Failed to move lead.");
    }
  }

  const columns = statuses.map((status) => ({
    key: status.name,
    title: status.name,
    description: status.description,
    leads: leads.filter((lead) => lead.status === status.name),
  }));
  const unmapped = leads.filter((lead) => !statuses.some((status) => status.name === lead.status));
  if (unmapped.length > 0) {
    columns.push({ key: "__other__", title: "Other", description: "Status not in master data.", leads: unmapped });
  }

  return (
    <div>
      <form onSubmit={applyFilters} className="mt-6 flex flex-row gap-3">
        <input
          type="search"
          value={draftQ}
          onChange={(event) => setDraftQ(event.target.value)}
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
            <Link
              href="/sales/views/leads/create"
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              New lead
            </Link>
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
              className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-slate-50/80 p-3 transition ${
                dropTarget === column.key ? "border-blue-400 ring-4 ring-blue-100" : "border-slate-200"
              }`}
            >
              <header className="px-1 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">{column.title}</h2>
                  <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {column.leads.length}
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
                      className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow ${
                        dragUuid === lead.uuid ? "opacity-50" : ""
                      } ${canUpdate ? "cursor-grab active:cursor-grabbing" : ""}`}
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
    </div>
  );
}
