"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { SALES_ORDER_LIST_PATH } from "@/app/sales/views/sales-orders/paths";
import type { SalesOrder } from "@/app/sales/models/SalesOrderModel";
import type { PurchaseRequest } from "@/app/sales/models/PurchaseRequestModel";
import type { Customer } from "@/app/sales/models/CustomerModel";
import type { Product } from "@/app/product/models/ProductModel";
import type { ProductVariant } from "@/app/product/models/ProductVariantModel";
import type { Warehouse } from "@/app/warehouse/models/WarehouseModel";
import { SelectField, TextAreaField, TextField } from "@/components/FormField";
import { OrderItemsEditor, newOrderItemRow, orderLineTotal, type OrderItemRow } from "@/components/OrderItemsEditor";
import type { SessionInfo } from "@/libraries/Auth";
import { getEncrypted, postEncrypted, putEncrypted } from "@/libraries/EncryptedFetch";

const API_PATH = "/sales/api/v1/sales-orders";
const PR_API = "/sales/api/v1/purchase-requests";

export type SalesOrderFormInitial = Partial<Pick<SalesOrder, "customer_id" | "purchase_request_id" | "warehouse_id" | "discount_pct" | "notes" | "status">> & {
  items?: Array<{ product_id: string; variant_id: string | null; qty: number; unit_price: number; discount_pct: number; notes: string | null }>;
};

export function SalesOrderForm({
  mode,
  uuid,
  initial,
  session: _session,
}: {
  mode: "create" | "edit";
  uuid?: string;
  initial?: SalesOrderFormInitial;
  session: SessionInfo;
}) {
  void _session;
  const router = useRouter();
  const autoCopiedRef = useRef(false);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [customerId, setCustomerId] = useState(initial?.customer_id ?? "");
  const [purchaseRequestId, setPurchaseRequestId] = useState(initial?.purchase_request_id ?? "");
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

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [customerResult, warehouseResult, productResult, variantResult, prResult] = await Promise.allSettled([
          getEncrypted<Customer[]>(`/sales/api/v1/customers?limit=100&sortProperty=name&sortDirection=asc`),
          getEncrypted<Warehouse[]>(`/warehouse/api/v1/warehouses?limit=100&sortProperty=code&sortDirection=asc`),
          getEncrypted<Product[]>(`/product/api/v1/products?limit=100&sortProperty=name&sortDirection=asc`),
          getEncrypted<ProductVariant[]>(`/product/api/v1/product-variants?limit=100&sortDirection=asc&sortProperty=name`),
          getEncrypted<PurchaseRequest[]>(`${PR_API}?limit=100&sortProperty=created_at&sortDirection=desc`),
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
        customer_id: customerId || undefined,
        purchase_request_id: purchaseRequestId || null,
        warehouse_id: warehouseId || null,
        discount_pct: Number(String(formData.get("discount_pct") ?? "").trim() || 0),
        notes: String(formData.get("notes") ?? "").trim() || null,
        status: String(formData.get("status") ?? "draft"),
      };
      if (Number.isNaN(payload.discount_pct)) {
        setError("Discount must be a number.");
        setIsPending(false);
        return;
      }

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
      router.push(SALES_ORDER_LIST_PATH);
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
            <SelectField
              label="Copy deal prices from PR (optional)"
              name="copy_pr"
              value=""
              onChange={(event) => void copyFromPr(event.target.value)}
              disabled={optionsLoading}
              options={purchaseRequests.map((option) => ({ value: option.uuid, label: `${option.uuid.slice(0, 8)} · ${option.status} · ${option.grand_total}` }))}
              placeholder={optionsLoading ? "Loading purchase requests..." : "Select PR to copy..."}
              hint="Fills customer, warehouse and item lines. The payload stays explicit."
            />
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

          {mode === "create" ? (
            <>
              <OrderItemsEditor rows={rows} setRows={setRows} products={products} variants={variants} />
              <p className="text-sm text-slate-600" role="status">
                Items subtotal preview: {previewTotal} (server snapshots on save)
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Items are fixed after creation; edit header fields only.</p>
          )}

          {purchaseRequestId ? (
            <p className="text-xs text-slate-500">Linked purchase request: {purchaseRequestId.slice(0, 8)} (closed on save).</p>
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
