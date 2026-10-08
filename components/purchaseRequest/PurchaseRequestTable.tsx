"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Table, type TableColumn, type TableRow } from "@/components/Table";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMoney } from "@/libraries/Currency";
import type { PurchaseRequest } from "@/app/sales/models/PurchaseRequestModel";
import type { Customer } from "@/app/sales/models/CustomerModel";
import type { Warehouse } from "@/app/warehouse/models/WarehouseModel";
import type { SessionInfo } from "@/libraries/Auth";
import { deleteEncrypted, getEncrypted } from "@/libraries/EncryptedFetch";

const API_PATH = "/sales/api/v1/purchase-requests";

const STATUS_OPTIONS = ["draft", "submitted", "approved", "rejected", "closed"];

const COLUMNS: TableColumn[] = [
  { key: "doc_number", label: "Doc No", field: "doc_number" },
  { key: "customer", label: "Customer", field: "customer_id" },
  { key: "status", label: "Status", field: "status" },
  { key: "grand_total", label: "Total", field: "grand_total" },
  { key: "created_at", label: "Created", field: "created_at" },
];

async function fetchPurchaseRequestRows(params: URLSearchParams): Promise<TableRow[]> {
  let envelope;
  try {
    envelope = await getEncrypted<PurchaseRequest[]>(`${API_PATH}?${params.toString()}`);
  } catch {
    throw new Error("Something went wrong. Please try again.");
  }
  if (!envelope.success) {
    throw new Error(envelope.message || "Failed to fetch purchase requests.");
  }
  return (envelope.data ?? []) as TableRow[];
}

async function deletePurchaseRequestRow(uuid: string): Promise<string> {
  try {
    const envelope = await deleteEncrypted<{ message: string }>(`${API_PATH}/${uuid}`);
    return envelope.success ? "" : envelope.message || "Failed to delete purchase request.";
  } catch {
    return "Something went wrong. Please try again.";
  }
}

function renderPurchaseRequestCell(column: TableColumn, row: TableRow, value: unknown) {
  if (column.key === "doc_number") {
    return <span className="font-medium whitespace-nowrap text-slate-900">{String(value ?? "—")}</span>;
  }
  if (column.key === "customer") {
    const customer = (row as TableRow & { customer?: { id: string; name: string } | null }).customer;
    return <span className="text-slate-900">{customer?.name ?? String(value ?? "—")}</span>;
  }
  if (column.key === "status") {
    return <StatusBadge status={String(value)} />;
  }
  if (column.key === "grand_total") {
    return <span className="block text-right tabular-nums text-slate-900">{formatMoney(value)}</span>;
  }
  if (column.key === "created_at") {
    return <span className="whitespace-nowrap">{new Date(String(value)).toLocaleString()}</span>;
  }
  return undefined;
}

export function PurchaseRequestTable({
  session,
  extraParams,
}: {
  session: SessionInfo;
  extraParams?: Record<string, string>;
}) {
  const [applied, setApplied] = useState<Record<string, string>>({ ...(extraParams ?? {}) });
  const [draftCustomerId, setDraftCustomerId] = useState("");
  const [draftWarehouseId, setDraftWarehouseId] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  // Independent degrade: one dropdown failing must not block the other.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [customerResult, warehouseResult] = await Promise.allSettled([
          getEncrypted<Customer[]>(`/sales/api/v1/customers?limit=100&sortProperty=name&sortDirection=asc`),
          getEncrypted<Warehouse[]>(`/warehouse/api/v1/warehouses?limit=100&sortProperty=code&sortDirection=asc`),
        ]);
        if (!active) {
          return;
        }
        if (customerResult.status === "fulfilled" && customerResult.value.success) {
          setCustomers((customerResult.value.data ?? []).filter((row) => row.status !== "deleted"));
        } else {
          console.error("[purchase-request-table] customers failed:", customerResult);
        }
        if (warehouseResult.status === "fulfilled" && warehouseResult.value.success) {
          setWarehouses((warehouseResult.value.data ?? []).filter((row) => row.status !== "deleted"));
        } else {
          console.error("[purchase-request-table] warehouses failed:", warehouseResult);
        }
      } catch (error) {
        if (active) {
          console.error("[purchase-request-table] filter options failed:", error);
        }
      } finally {
        if (active) {
          setOptionsLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = { ...(extraParams ?? {}) };
    if (draftCustomerId) {
      next["filter[customer_id]"] = draftCustomerId;
    }
    if (draftWarehouseId) {
      next["filter[warehouse_id]"] = draftWarehouseId;
    }
    if (draftStatus) {
      next["filter[status]"] = draftStatus;
    }
    setApplied(next);
  }

  function resetFilters() {
    setDraftCustomerId("");
    setDraftWarehouseId("");
    setDraftStatus("");
    setApplied({ ...(extraParams ?? {}) });
  }

  return (
    <div>
      <form onSubmit={applyFilters} className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <select
          value={draftCustomerId}
          onChange={(event) => setDraftCustomerId(event.target.value)}
          disabled={optionsLoading}
          aria-label="Filter by customer"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        >
          <option value="">All customers</option>
          {customers.map((option) => (
            <option key={option.uuid} value={option.uuid}>
              {option.name}
            </option>
          ))}
        </select>
        <select
          value={draftWarehouseId}
          onChange={(event) => setDraftWarehouseId(event.target.value)}
          disabled={optionsLoading}
          aria-label="Filter by warehouse"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        >
          <option value="">All warehouses</option>
          {warehouses.map((option) => (
            <option key={option.uuid} value={option.uuid}>
              {option.code} · {option.name}
            </option>
          ))}
        </select>
        <select
          value={draftStatus}
          onChange={(event) => setDraftStatus(event.target.value)}
          aria-label="Filter by status"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
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
        </div>
      </form>

      <Table
        key={JSON.stringify(applied)}
        session={session}
        columns={COLUMNS}
        actionUpdate={["sales:purchase-request:view:update"]}
        actionDelete={["sales:purchase-request:view:delete"]}
        fetchRows={fetchPurchaseRequestRows}
        basePath="/sales/views/purchase-requests"
        extraParams={applied}
        labelField="uuid"
        renderCell={renderPurchaseRequestCell}
        onDelete={deletePurchaseRequestRow}
        isRowLocked={(row) => row.status === "closed"}
      />
    </div>
  );
}
