"use client";

import { useState } from "react";
import { Table, type TableColumn, type TableRow } from "@/components/Table";
import { StatusBadge } from "@/components/StatusBadge";
import type { PurchaseRequest } from "@/app/sales/models/PurchaseRequestModel";
import type { SessionInfo } from "@/libraries/Auth";
import { deleteEncrypted, getEncrypted } from "@/libraries/EncryptedFetch";

const API_PATH = "/sales/api/v1/purchase-requests";

const COLUMNS: TableColumn[] = [
  { key: "uuid", label: "ID", field: "uuid" },
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

export function PurchaseRequestTable({
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
        actionUpdate={["sales:purchase-request:view:update"]}
        actionDelete={["sales:purchase-request:view:delete"]}
        fetchRows={fetchPurchaseRequestRows}
        basePath="/sales/views/purchase-requests"
        extraParams={applied}
        labelField="uuid"
        renderCell={renderPurchaseRequestCell}
        onDelete={deletePurchaseRequestRow}
      />
    </div>
  );
}
