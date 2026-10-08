"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Table, type TableColumn, type TableRow } from "@/components/Table";
import { StatusBadge } from "@/components/StatusBadge";
import type { DeliveryOrder } from "@/app/sales/models/DeliveryOrderModel";
import type { SalesOrder } from "@/app/sales/models/SalesOrderModel";
import type { Warehouse } from "@/app/warehouse/models/WarehouseModel";
import type { SessionInfo } from "@/libraries/Auth";
import { deleteEncrypted, getEncrypted } from "@/libraries/EncryptedFetch";

const API_PATH = "/sales/api/v1/delivery-orders";

const STATUS_OPTIONS = ["draft", "packed", "shipped", "delivered", "cancelled"];

const COLUMNS: TableColumn[] = [
  { key: "doc_number", label: "Doc No", field: "doc_number" },
  { key: "customer", label: "Customer", field: "customer_id" },
  { key: "status", label: "Status", field: "status" },
  { key: "fulfillment", label: "Fulfillment", field: "fulfillment" },
  { key: "created_at", label: "Created", field: "created_at" },
];

async function fetchDeliveryOrderRows(params: URLSearchParams): Promise<TableRow[]> {
  let envelope;
  try {
    envelope = await getEncrypted<DeliveryOrder[]>(`${API_PATH}?${params.toString()}`);
  } catch {
    throw new Error("Something went wrong. Please try again.");
  }
  if (!envelope.success) {
    throw new Error(envelope.message || "Failed to fetch delivery orders.");
  }
  return (envelope.data ?? []) as TableRow[];
}

async function deleteDeliveryOrderRow(uuid: string): Promise<string> {
  try {
    const envelope = await deleteEncrypted<{ message: string }>(`${API_PATH}/${uuid}`);
    return envelope.success ? "" : envelope.message || "Failed to delete delivery order.";
  } catch {
    return "Something went wrong. Please try again.";
  }
}

function renderDeliveryOrderCell(column: TableColumn, row: TableRow, value: unknown) {
  if (column.key === "doc_number") {
    return <span className="font-medium whitespace-nowrap text-slate-900">{String(value ?? "—")}</span>;
  }
  if (column.key === "customer") {
    const customer = (row as TableRow & { customer?: { id: string; name: string } | null }).customer;
    return <span className="text-slate-900">{customer?.name ?? "—"}</span>;
  }
  if (column.key === "status" || column.key === "fulfillment") {
    return value ? <StatusBadge status={String(value)} /> : <span className="text-xs text-slate-400">—</span>;
  }
  if (column.key === "created_at") {
    return <span className="whitespace-nowrap">{new Date(String(value)).toLocaleString()}</span>;
  }
  return undefined;
}

export function DeliveryOrderTable({
  session,
  extraParams,
  initialParams,
}: {
  session: SessionInfo;
  extraParams?: Record<string, string>;
  /** Deep-link presets (e.g. from the SO detail page); also seed the form. */
  initialParams?: Record<string, string>;
}) {
  const seed = { ...(extraParams ?? {}), ...(initialParams ?? {}) };
  const [applied, setApplied] = useState<Record<string, string>>(seed);
  const [draftSalesOrderId, setDraftSalesOrderId] = useState(seed["filter[sales_order_id]"] ?? "");
  const [draftWarehouseId, setDraftWarehouseId] = useState(seed["filter[warehouse_id]"] ?? "");
  const [draftStatus, setDraftStatus] = useState(seed["filter[status]"] ?? "");
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  // Independent degrade: one dropdown failing must not block the other.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [orderResult, warehouseResult] = await Promise.allSettled([
          getEncrypted<SalesOrder[]>(`/sales/api/v1/sales-orders?limit=100&sortProperty=created_at&sortDirection=desc`),
          getEncrypted<Warehouse[]>(`/warehouse/api/v1/warehouses?limit=100&sortProperty=code&sortDirection=asc`),
        ]);
        if (!active) {
          return;
        }
        if (orderResult.status === "fulfilled" && orderResult.value.success) {
          setOrders(orderResult.value.data ?? []);
        } else {
          console.error("[delivery-order-table] sales orders failed:", orderResult);
        }
        if (warehouseResult.status === "fulfilled" && warehouseResult.value.success) {
          setWarehouses((warehouseResult.value.data ?? []).filter((row) => row.status !== "deleted"));
        } else {
          console.error("[delivery-order-table] warehouses failed:", warehouseResult);
        }
      } catch (error) {
        if (active) {
          console.error("[delivery-order-table] filter options failed:", error);
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
    if (draftSalesOrderId) {
      next["filter[sales_order_id]"] = draftSalesOrderId;
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
    setDraftSalesOrderId("");
    setDraftWarehouseId("");
    setDraftStatus("");
    setApplied({ ...(extraParams ?? {}) });
  }

  const selectClass =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

  return (
    <div>
      <form onSubmit={applyFilters} className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <select
          value={draftSalesOrderId}
          onChange={(event) => setDraftSalesOrderId(event.target.value)}
          disabled={optionsLoading}
          aria-label="Filter by sales order"
          className={selectClass}
        >
          <option value="">All sales orders</option>
          {orders.map((option) => (
            <option key={option.uuid} value={option.uuid}>
              {option.doc_number ?? option.uuid.slice(0, 8)} · {option.status}
            </option>
          ))}
        </select>
        <select
          value={draftWarehouseId}
          onChange={(event) => setDraftWarehouseId(event.target.value)}
          disabled={optionsLoading}
          aria-label="Filter by warehouse"
          className={selectClass}
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
          className={selectClass}
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
        actionUpdate={["sales:delivery-order:view:update"]}
        actionDelete={["sales:delivery-order:view:delete"]}
        fetchRows={fetchDeliveryOrderRows}
        basePath="/sales/views/delivery-orders"
        extraParams={applied}
        labelField="uuid"
        renderCell={renderDeliveryOrderCell}
        onDelete={deleteDeliveryOrderRow}
        isRowUpdateLocked={(row) => row.status === "delivered" || row.status === "cancelled"}
        isRowDeleteLocked={(row) => row.status !== "draft"}
        lockedLabel="Locked"
      />
    </div>
  );
}
