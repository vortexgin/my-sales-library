"use client";

import { useState } from "react";
import { Table, type TableColumn, type TableRow } from "@/components/Table";
import { StatusBadge } from "@/components/StatusBadge";
import type { DeliveryOrder } from "@/app/sales/models/DeliveryOrderModel";
import type { SessionInfo } from "@/libraries/Auth";
import { deleteEncrypted, getEncrypted } from "@/libraries/EncryptedFetch";

const API_PATH = "/sales/api/v1/delivery-orders";

const COLUMNS: TableColumn[] = [
  { key: "uuid", label: "ID", field: "uuid" },
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
  if (column.key === "uuid") {
    return <span className="font-mono text-xs text-slate-900">{String(value ?? "").slice(0, 8)}</span>;
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
}: {
  session: SessionInfo;
  extraParams?: Record<string, string>;
}) {
  const [applied] = useState<Record<string, string>>({ ...(extraParams ?? {}) });

  return (
    <div>
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
      />
    </div>
  );
}
