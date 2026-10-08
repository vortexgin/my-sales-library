"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { SALES_ORDER_LIST_PATH } from "@/app/sales/views/sales-orders/paths";
import type { SalesOrder } from "@/app/sales/models/SalesOrderModel";
import type { SalesOrderMetadata } from "@/app/sales/models/SalesOrderMetadataModel";
import type { DocMetadataField } from "@/app/sales/models/DocMetadataFieldModel";
import { formatMoney } from "@/libraries/Currency";
import type { PurchaseRequest } from "@/app/sales/models/PurchaseRequestModel";
import type { Customer } from "@/app/sales/models/CustomerModel";
import type { Product } from "@/app/product/models/ProductModel";
import type { ProductVariant } from "@/app/product/models/ProductVariantModel";
import type { Warehouse } from "@/app/warehouse/models/WarehouseModel";
import { SelectField, TextAreaField, TextField } from "@/components/FormField";
import { AuthComponent } from "@/components/AuthComponent";
import { UploadButton } from "@/components/UploadButton";
import { OrderItemsEditor, newOrderItemRow, orderLineTotal, type OrderItemRow } from "@/app/sales/components/orderItems/OrderItemsEditor";
import type { SessionInfo } from "@/libraries/Auth";
import { getEncrypted, postEncrypted, putEncrypted } from "@/libraries/EncryptedFetch";

const API_PATH = "/sales/api/v1/sales-orders";
const PR_API = "/sales/api/v1/purchase-requests";
const UPLOAD_PERMISSION = "base:tools:upload:upload";
const NEW_FIELD_VALUE = "__new__";

const rowLabelClass = "mb-1 block text-xs font-medium text-slate-600";
const rowInputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500";
const rowValueInputClass =
  "w-full min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500";

type MetadataRow = {
  key: string;
  uuid?: string;
  field_id: string;
  value: string;
  isNew: boolean;
  newName: string;
};

export type SalesOrderFormInitial = Partial<Pick<SalesOrder, "customer_id" | "purchase_request_id" | "warehouse_id" | "discount_pct" | "notes" | "status">> & {
  items?: Array<{ product_id: string; variant_id: string | null; qty: number; unit_price: number; discount_pct: number; notes: string | null }>;
  metadata?: Array<Pick<SalesOrderMetadata, "uuid" | "sales_doc_metadata_field_id" | "value"> & { field_name?: string }>;
};

function newMetadataRow(): MetadataRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    field_id: "",
    value: "",
    isNew: false,
    newName: "",
  };
}

export function SalesOrderForm({
  mode,
  uuid,
  initial,
  session,
}: {
  mode: "create" | "edit";
  uuid?: string;
  initial?: SalesOrderFormInitial;
  session: SessionInfo;
}) {
  const router = useRouter();
  const autoCopiedRef = useRef(false);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [metadataFields, setMetadataFields] = useState<DocMetadataField[]>([]);
  const [metadataFieldsError, setMetadataFieldsError] = useState("");
  const [customerId, setCustomerId] = useState(initial?.customer_id ?? "");
  const [purchaseRequestId, setPurchaseRequestId] = useState(initial?.purchase_request_id ?? "");
  // Deep-linked PR (?purchase_request_id=) is fixed: the copy dropdown is
  // replaced with a locked display and the link can't be changed.
  const prLocked = mode === "create" && !!initial?.purchase_request_id;
  const [warehouseId, setWarehouseId] = useState(initial?.warehouse_id ?? "");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const [rows, setRows] = useState<OrderItemRow[]>(() =>
    (initial?.items ?? []).map((item) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2)}-${item.product_id}`,
      product_id: item.product_id,
      variant_id: item.variant_id ?? "",
      qty: String(item.qty),
      unit_price: String(item.unit_price),
      discount_pct: String(item.discount_pct ?? 0),
      notes: item.notes ?? "",
    })),
  );
  const [metadataRows, setMetadataRows] = useState<MetadataRow[]>(() =>
    (initial?.metadata ?? []).map((item, index) => ({
      key: item.uuid ?? `initial-${index}-${Math.random().toString(36).slice(2)}`,
      uuid: item.uuid,
      field_id: item.sales_doc_metadata_field_id,
      value: item.value,
      isNew: false,
      newName: "",
    })),
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [customerResult, warehouseResult, productResult, variantResult, prResult, metadataFieldResult] = await Promise.allSettled([
          getEncrypted<Customer[]>(`/sales/api/v1/customers?limit=100&sortProperty=name&sortDirection=asc`),
          getEncrypted<Warehouse[]>(`/warehouse/api/v1/warehouses?limit=100&sortProperty=code&sortDirection=asc`),
          getEncrypted<Product[]>(`/product/api/v1/products?limit=100&sortProperty=name&sortDirection=asc`),
          getEncrypted<ProductVariant[]>(`/product/api/v1/product-variants?limit=100&sortDirection=asc&sortProperty=name`),
          getEncrypted<PurchaseRequest[]>(`${PR_API}?limit=100&sortProperty=created_at&sortDirection=desc`),
          getEncrypted<DocMetadataField[]>(`/sales/api/v1/doc-metadata-fields?limit=100&sortProperty=name&sortDirection=asc`),
        ]);
        if (!active) {
          return;
        }
        let failed = false;
        if (customerResult.status === "fulfilled" && customerResult.value.success) {
          setCustomers((customerResult.value.data ?? []).filter((row) => (row.status as string) !== "deleted"));
        } else {
          failed = true;
        }
        if (warehouseResult.status === "fulfilled" && warehouseResult.value.success) {
          setWarehouses((warehouseResult.value.data ?? []).filter((row) => (row.status as string) !== "deleted"));
        } else {
          failed = true;
        }
        if (productResult.status === "fulfilled" && productResult.value.success) {
          setProducts((productResult.value.data ?? []).filter((row) => (row.status as string) !== "deleted"));
        } else {
          failed = true;
        }
        if (variantResult.status === "fulfilled" && variantResult.value.success) {
          setVariants((variantResult.value.data ?? []).filter((row) => (row.status as string) !== "deleted"));
        } else {
          failed = true;
        }
        if (prResult.status === "fulfilled" && prResult.value.success) {
          setPurchaseRequests((prResult.value.data ?? []).filter((row) => (row.status as string) !== "deleted"));
        } else {
          failed = true;
        }
        if (metadataFieldResult.status === "fulfilled" && metadataFieldResult.value.success) {
          setMetadataFields((metadataFieldResult.value.data ?? []).filter((row) => row.status !== "deleted"));
        } else {
          setMetadataFieldsError("Metadata fields failed to load. You can still add a new field manually.");
        }
        if (failed) {
          setOptionsError("Some dropdowns failed to load. Selections may be incomplete.");
        }
      } catch {
        if (active) {
          setOptionsError("Failed to load options. Please try again.");
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

  function updateMetadataRow(key: string, patch: Partial<MetadataRow>) {
    setMetadataRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeMetadataRow(key: string) {
    setMetadataRows((current) => current.filter((row) => row.key !== key));
  }

  /** Copy deal prices from a PR: items + PR link, client-side only. */
  async function copyFromPr(prUuid: string) {
    if (!prUuid) {
      return;
    }
    setError("");
    try {
      const envelope = await getEncrypted<PurchaseRequest & { items: Array<{ product_id: string; variant_id: string | null; qty: number; unit_price: number; discount_pct: number; notes: string | null }> }>(
        `${PR_API}/${prUuid}`,
      );
      if (!envelope.success) {
        throw new Error(envelope.message || "Failed to load purchase request.");
      }
      const pr = envelope.data;
      setPurchaseRequestId(pr.uuid);
      setCustomerId(pr.customer_id);
      if (pr.warehouse_id) {
        setWarehouseId(pr.warehouse_id);
      }
      setRows(
        (pr.items ?? []).map((item) => ({
          ...newOrderItemRow(),
          product_id: item.product_id,
          variant_id: item.variant_id ?? "",
          qty: String(item.qty),
          unit_price: String(item.unit_price),
          discount_pct: String(item.discount_pct ?? 0),
          notes: item.notes ?? "",
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy purchase request.");
    }
  }

  // Deep-link support (?purchase_request_id=): auto-copy once options settle.
  // One-shot deep-link fill; user edits afterwards are untouched.
  useEffect(() => {
    if (mode !== "create" || autoCopiedRef.current || optionsLoading) {
      return;
    }
    if (initial?.purchase_request_id) {
      autoCopiedRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void copyFromPr(initial.purchase_request_id);
    }
  }, [mode, optionsLoading, initial?.purchase_request_id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || optionsLoading) {
      return;
    }
    setError("");
    setIsPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      const payload: Record<string, unknown> = {
        warehouse_id: warehouseId || null,
        discount_pct: Number(String(formData.get("discount_pct") ?? "").trim() || 0),
        notes: String(formData.get("notes") ?? "").trim() || null,
        status: String(formData.get("status") ?? "draft"),
      };
      // Customer and PR link are immutable after creation (update schema rejects them).
      if (mode === "create") {
        payload.customer_id = customerId || undefined;
        payload.purchase_request_id = purchaseRequestId || null;
      }
      if (Number.isNaN(payload.discount_pct)) {
        setError("Discount must be a number.");
        setIsPending(false);
        return;
      }

      const metadata = metadataRows
        .map((row) => {
          const value = row.value.trim();
          if (!value) {
            return null;
          }
          if (row.isNew) {
            const name = row.newName.trim();
            if (!name) {
              return { invalid: true };
            }
            return { field_name: name, value, ...(row.uuid ? { uuid: row.uuid } : {}) };
          }
          if (!row.field_id) {
            return { invalid: true };
          }
          return {
            sales_doc_metadata_field_id: row.field_id,
            value,
            ...(row.uuid ? { uuid: row.uuid } : {}),
          };
        })
        .filter(Boolean) as Record<string, unknown>[];
      if (metadata.some((item) => item.invalid)) {
        setError("Each metadata row needs a field (or a new field name) and a value.");
        setIsPending(false);
        return;
      }
      // Full selection state is submitted; omitted persisted rows are soft-deleted.
      payload.metadata = metadata;

      if (mode === "create") {
        const items = rows.map((row) => ({
          product_id: row.product_id || undefined,
          variant_id: row.variant_id || null,
          qty: Number(row.qty),
          unit_price: Number(row.unit_price),
          discount_pct: row.discount_pct.trim() === "" ? 0 : Number(row.discount_pct),
          notes: row.notes.trim() || null,
        }));
        if (items.length === 0) {
          setError("Add at least one item.");
          setIsPending(false);
          return;
        }
        if (items.some((item) => !item.product_id || !(item.qty >= 1) || !(item.unit_price >= 0))) {
          setError("Each item needs a product, qty ≥ 1 and unit price ≥ 0.");
          setIsPending(false);
          return;
        }
        payload.items = items;
      }

      const envelope =
        mode === "create"
          ? await postEncrypted<SalesOrder>(API_PATH, payload)
          : await putEncrypted<SalesOrder>(`${API_PATH}/${uuid}`, payload);

      if (!envelope.success) {
        setError(envelope.message || `Failed to ${mode === "create" ? "create" : "update"} sales order.`);
        return;
      }
      router.push(mode === "create" ? SALES_ORDER_LIST_PATH : `${SALES_ORDER_LIST_PATH}/${uuid}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  const previewTotal = rows.reduce((sum, row) => sum + orderLineTotal(row), 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">
          {mode === "create" ? "New sales order" : "Edit sales order"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {mode === "create" ? "Create sales order." : "Update sales order."}
        </h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {mode === "create" ? (
            prLocked ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Purchase request:{" "}
                <span className="font-medium text-slate-900">
                  {purchaseRequests.find((option) => option.uuid === initial?.purchase_request_id)
                    ? `${purchaseRequests.find((option) => option.uuid === initial?.purchase_request_id)?.doc_number ?? initial?.purchase_request_id?.slice(0, 8)} · ${purchaseRequests.find((option) => option.uuid === initial?.purchase_request_id)?.status}`
                    : (initial?.purchase_request_id ?? "—")}
                </span>{" "}
                (fixed from the purchase request page)
              </div>
            ) : (
              <SelectField
                label="Copy deal prices from PR (optional)"
                name="copy_pr"
                value=""
                onChange={(event) => void copyFromPr(event.target.value)}
                disabled={optionsLoading}
                options={purchaseRequests.map((option) => ({ value: option.uuid, label: `${option.doc_number ?? option.uuid.slice(0, 8)} · ${option.status} · ${formatMoney(option.grand_total)}` }))}
                placeholder={optionsLoading ? "Loading purchase requests..." : "Select PR to copy..."}
                hint="Fills customer, warehouse and item lines. The payload stays explicit."
              />
            )
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label="Customer"
              name="customer_id"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              disabled={optionsLoading || mode === "edit"}
              options={customers.map((option) => ({ value: option.uuid, label: `${option.name} · ${option.email}` }))}
              placeholder={optionsLoading ? "Loading customers..." : "Select customer..."}
            />
            <SelectField
              label="Warehouse"
              name="warehouse_id"
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
              disabled={optionsLoading}
              options={warehouses.map((option) => ({ value: option.uuid, label: `${option.code} · ${option.name}` }))}
              placeholder={optionsLoading ? "Loading warehouses..." : "— None —"}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Discount %"
              name="discount_pct"
              type="number"
              min={0}
              max={100}
              step="any"
              defaultValue={initial?.discount_pct ?? 0}
            />
            <SelectField
              label="Status"
              name="status"
              defaultValue={initial?.status ?? "draft"}
              options={[
                { value: "draft", label: "draft" },
                { value: "confirmed", label: "confirmed" },
                { value: "paid", label: "paid" },
                { value: "shipped", label: "shipped" },
                { value: "cancelled", label: "cancelled" },
              ]}
            />
          </div>

          <TextAreaField label="Notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} placeholder="Order notes..." />

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Sales order metadata</h2>
                <p className="mt-0.5 text-xs text-slate-500">Pick a shared document field or add one on the fly.</p>
                {metadataFieldsError ? (
                  <p role="alert" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {metadataFieldsError}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setMetadataRows((current) => [...current, newMetadataRow()])}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Add row
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {metadataRows.map((row, index) => (
                <div key={row.key} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <SelectField
                      label={`Field #${index + 1}`}
                      value={row.isNew ? NEW_FIELD_VALUE : row.field_id}
                      onChange={(event) => {
                        const selected = event.target.value;
                        updateMetadataRow(row.key, selected === NEW_FIELD_VALUE
                          ? { isNew: true, field_id: "", newName: "" }
                          : { isNew: false, field_id: selected, newName: "" });
                      }}
                      options={[
                        ...metadataFields.map((field) => ({ value: field.uuid, label: field.name })),
                        { value: NEW_FIELD_VALUE, label: "+ Add new field..." },
                      ]}
                      placeholder={optionsLoading ? "Loading fields..." : "Select field..."}
                      labelClassName={rowLabelClass}
                      className={rowInputClass}
                    />
                    {row.isNew ? (
                      <div className="mt-2">
                        <TextField
                          value={row.newName}
                          onChange={(event) => updateMetadataRow(row.key, { newName: event.target.value })}
                          placeholder="New field name, e.g. Project code"
                          className={rowInputClass}
                        />
                      </div>
                    ) : null}
                  </div>
                  <TextField
                    label="Value"
                    value={row.value}
                    onChange={(event) => updateMetadataRow(row.key, { value: event.target.value })}
                    placeholder="Field value"
                    labelClassName={rowLabelClass}
                    className={rowValueInputClass}
                    action={
                      <AuthComponent
                        user={session.user}
                        permissions={session.permissions}
                        allowedPermissions={[UPLOAD_PERMISSION]}
                      >
                        <UploadButton
                          onUploaded={(url) => updateMetadataRow(row.key, { value: url })}
                          onError={setError}
                        />
                      </AuthComponent>
                    }
                  />
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeMetadataRow(row.key)}
                      aria-label={`Remove metadata row ${index + 1}`}
                      className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {mode === "create" ? (
            <>
              <OrderItemsEditor rows={rows} setRows={setRows} products={products} variants={variants} />
              <p className="text-sm text-slate-600" role="status">
                Items subtotal preview: {formatMoney(previewTotal)} (server snapshots on save)
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Items are fixed after creation; edit header fields only.</p>
          )}

          {purchaseRequestId ? (
            <p className="text-xs text-slate-500">Linked purchase request: {purchaseRequests.find((option) => option.uuid === purchaseRequestId)?.doc_number ?? purchaseRequestId.slice(0, 8)} (closed on save).</p>
          ) : null}

          {optionsError ? (
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {optionsError}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isPending || optionsLoading}
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {isPending ? "Saving..." : mode === "create" ? "Create sales order" : "Save changes"}
            </button>
            <Link
              href={SALES_ORDER_LIST_PATH}
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
