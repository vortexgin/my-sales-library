"use client";

import { useState } from "react";
import { Table, type TableColumn, type TableRow } from "@/components/Table";
import { StatusBadge } from "@/components/StatusBadge";
import type { SalesOrder } from "@/app/sales/models/SalesOrderModel";
import type { SessionInfo } from "@/libraries/Auth";
import { deleteEncrypted, getEncrypted } from "@/libraries/EncryptedFetch";

const API_PATH = "/sales/api/v1/sales-orders";

const COLUMNS: TableColumn[] = [
  { key: "uuid", label: "ID", field: "uuid" },
  { key: "status", label: "Status", field: "status" },
  { key: "grand_total", label: "Total", field: "grand_total" },
  { key: "created_at", label: "Created", field: "created_at" },
];

async function fetchSalesOrderRows(params: URLSearchParams): Promise<TableRow[]> {
  let envelope;
  try {
    envelope = await getEncrypted<SalesOrder[]>(`${API_PATH}?${params.toString()}`);
  } catch {
    throw new Error("Something went wrong. Please try again.");
  }
  if (!envelope.success) {
    throw new Error(envelope.message || "Failed to fetch sales orders.");
  }
  return (envelope.data ?? []) as TableRow[];
}

async function deleteSalesOrderRow(uuid: string): Promise<string> {
  try {
    const envelope = await deleteEncrypted<{ message: string }>(`${API_PATH}/${uuid}`);
    return envelope.success ? "" : envelope.message || "Failed to delete sales order.";
  } catch {
    return "Something went wrong. Please try again.";
  }
}

function renderSalesOrderCell(column: TableColumn, row: TableRow, value: unknown) {
  if (column.key === "uuid") {
    return <span className="font-mono text-xs text-slate-900">{String(value ?? "").slice(0, 8)}</span>;
  }
  if (column.key === "status") {
    return <StatusBadge status={String(value)} />;
  }
  if (column.key === "created_at") {
    return <span className="whitespace-nowrap">{new Date(String(value)).toLocaleString()}</span>;
  }
  return undefined;
}

export function SalesOrderTable({
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
        actionUpdate={["sales:sales-order:view:update"]}
        actionDelete={["sales:sales-order:view:delete"]}
        fetchRows={fetchSalesOrderRows}
        basePath="/sales/views/sales-orders"
        extraParams={applied}
        labelField="uuid"
        renderCell={renderSalesOrderCell}
        onDelete={deleteSalesOrderRow}
      />
    </div>
  );
}
