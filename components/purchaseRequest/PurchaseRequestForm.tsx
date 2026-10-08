"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { PURCHASE_REQUEST_LIST_PATH } from "@/app/sales/views/purchase-requests/paths";
import type { PurchaseRequest } from "@/app/sales/models/PurchaseRequestModel";
import type { Customer } from "@/app/sales/models/CustomerModel";
import type { Product } from "@/app/product/models/ProductModel";
import type { ProductVariant } from "@/app/product/models/ProductVariantModel";
import type { Warehouse } from "@/app/warehouse/models/WarehouseModel";
import { SelectField, TextAreaField, TextField } from "@/components/FormField";
import { formatMoney } from "@/libraries/Currency";
import { OrderItemsEditor, orderLineTotal, type OrderItemRow } from "@/app/sales/components/orderItems/OrderItemsEditor";
import type { SessionInfo } from "@/libraries/Auth";
import { getEncrypted, postEncrypted, putEncrypted } from "@/libraries/EncryptedFetch";

const API_PATH = "/sales/api/v1/purchase-requests";

export type PurchaseRequestFormInitial = Partial<Pick<PurchaseRequest, "customer_id" | "warehouse_id" | "discount_pct" | "notes" | "status">> & {
  items?: Array<{ product_id: string; variant_id: string | null; qty: number; unit_price: number; discount_pct: number; notes: string | null }>;
};

export function PurchaseRequestForm({
  mode,
  uuid,
  initial,
  session: _session,
}: {
  mode: "create" | "edit";
  uuid?: string;
  initial?: PurchaseRequestFormInitial;
  session: SessionInfo;
}) {
  void _session;
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [customerId, setCustomerId] = useState(initial?.customer_id ?? "");
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
        const [customerResult, warehouseResult, productResult, variantResult] = await Promise.allSettled([
          getEncrypted<Customer[]>(`/sales/api/v1/customers?limit=100&sortProperty=name&sortDirection=asc`),
          getEncrypted<Warehouse[]>(`/warehouse/api/v1/warehouses?limit=100&sortProperty=code&sortDirection=asc`),
          getEncrypted<Product[]>(`/product/api/v1/products?limit=100&sortProperty=name&sortDirection=asc`),
          getEncrypted<ProductVariant[]>(`/product/api/v1/product-variants?limit=100&sortProperty=name&sortDirection=asc`),
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
      };
      // Customer is immutable after creation (update schema rejects it).
      if (mode === "create") {
        payload.customer_id = customerId || undefined;
      }
      // Status is edit-only: creates always start as draft (server default).
      if (mode === "edit") {
        payload.status = String(formData.get("status") ?? "draft");
      }
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
          ? await postEncrypted<PurchaseRequest>(API_PATH, payload)
          : await putEncrypted<PurchaseRequest>(`${API_PATH}/${uuid}`, payload);

      if (!envelope.success) {
        setError(envelope.message || `Failed to ${mode === "create" ? "create" : "update"} purchase request.`);
        return;
      }
      router.push(mode === "create" ? PURCHASE_REQUEST_LIST_PATH : `${PURCHASE_REQUEST_LIST_PATH}/${uuid}`);
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
          {mode === "create" ? "New purchase request" : "Edit purchase request"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {mode === "create" ? "Create purchase request." : "Update purchase request."}
        </h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
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
              label="Warehouse (requested bin)"
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
            {mode === "create" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Status: <span className="font-medium text-slate-900">draft</span> (new requests always start as draft)
              </div>
            ) : (
              <SelectField
                label="Status"
                name="status"
                defaultValue={initial?.status ?? "draft"}
                options={[
                  { value: "draft", label: "draft" },
                  { value: "submitted", label: "submitted" },
                  { value: "approved", label: "approved" },
                  { value: "rejected", label: "rejected" },
                  { value: "closed", label: "closed" },
                ]}
              />
            )}
          </div>

          <TextAreaField label="Notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} placeholder="Request notes..." />

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
              {isPending ? "Saving..." : mode === "create" ? "Create purchase request" : "Save changes"}
            </button>
            <Link
              href={PURCHASE_REQUEST_LIST_PATH}
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
