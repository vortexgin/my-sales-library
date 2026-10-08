"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { DELIVERY_ORDER_LIST_PATH } from "@/app/sales/views/delivery-orders/paths";
import type { DeliveryOrder } from "@/app/sales/models/DeliveryOrderModel";
import type { SalesOrder } from "@/app/sales/models/SalesOrderModel";
import type { Product } from "@/app/product/models/ProductModel";
import type { ProductVariant } from "@/app/product/models/ProductVariantModel";
import type { Warehouse } from "@/app/warehouse/models/WarehouseModel";
import { SelectField, TextAreaField } from "@/components/FormField";
import type { SessionInfo } from "@/libraries/Auth";
import { getEncrypted, postEncrypted } from "@/libraries/EncryptedFetch";

const API_PATH = "/sales/api/v1/delivery-orders";

type ItemRow = {
  key: string;
  product_id: string;
  variant_id: string;
  qty: string;
};

function newItemRow(): ItemRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    product_id: "",
    variant_id: "",
    qty: "1",
  };
}

export function DeliveryOrderForm({
  session: _session,
  initialSalesOrderId,
}: {
  session: SessionInfo;
  initialSalesOrderId?: string;
}) {
  void _session;
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [salesOrderId, setSalesOrderId] = useState(initialSalesOrderId ?? "");
  const [warehouseId, setWarehouseId] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const [rows, setRows] = useState<ItemRow[]>([newItemRow()]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [orderResult, warehouseResult, productResult, variantResult] = await Promise.allSettled([
          getEncrypted<SalesOrder[]>(`/sales/api/v1/sales-orders?limit=100&sortProperty=created_at&sortDirection=desc`),
          getEncrypted<Warehouse[]>(`/warehouse/api/v1/warehouses?limit=100&sortProperty=code&sortDirection=asc`),
          getEncrypted<Product[]>(`/product/api/v1/products?limit=100&sortProperty=name&sortDirection=asc`),
          getEncrypted<ProductVariant[]>(`/product/api/v1/product-variants?limit=100&sortProperty=name&sortDirection=asc`),
        ]);
        if (!active) {
          return;
        }
        let failed = false;
        if (orderResult.status === "fulfilled" && orderResult.value.success) {
          setOrders((orderResult.value.data ?? []).filter((row) => (row.status as string) !== "deleted"));
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

  function updateRow(key: string, patch: Partial<ItemRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || optionsLoading) {
      return;
    }
    setError("");
    setIsPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      const items = rows.map((row) => ({
        product_id: row.product_id || undefined,
        variant_id: row.variant_id || null,
        qty: Number(row.qty),
      }));
      if (items.length === 0) {
        setError("Add at least one item.");
        setIsPending(false);
        return;
      }
      if (items.some((item) => !item.product_id || !(item.qty >= 1))) {
        setError("Each item needs a product and qty ≥ 1.");
        setIsPending(false);
        return;
      }

      const payload: Record<string, unknown> = {
        sales_order_id: salesOrderId || undefined,
        warehouse_id: warehouseId || undefined,
        notes: String(formData.get("notes") ?? "").trim() || null,
        items,
      };

      const envelope = await postEncrypted<DeliveryOrder>(API_PATH, payload);
      if (!envelope.success) {
        setError(envelope.message || "Failed to create delivery order.");
        return;
      }
      router.push(DELIVERY_ORDER_LIST_PATH);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">New delivery order</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Create delivery order.</h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label="Sales order"
              name="sales_order_id"
              value={salesOrderId}
              onChange={(event) => setSalesOrderId(event.target.value)}
              disabled={optionsLoading}
              options={orders.map((option) => ({ value: option.uuid, label: `${option.uuid.slice(0, 8)} · ${option.status} · ${option.grand_total}` }))}
              placeholder={optionsLoading ? "Loading sales orders..." : "Select sales order..."}
            />
            <SelectField
              label="Warehouse"
              name="warehouse_id"
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
              disabled={optionsLoading}
              options={warehouses.map((option) => ({ value: option.uuid, label: `${option.code} · ${option.name}` }))}
              placeholder={optionsLoading ? "Loading warehouses..." : "Select warehouse..."}
            />
          </div>

          <TextAreaField label="Notes" name="notes" rows={3} placeholder="Delivery notes..." />

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Items</h2>
                <p className="mt-0.5 text-xs text-slate-500">System ship posts one out movement per item.</p>
              </div>
              <button
                type="button"
                onClick={() => setRows((current) => [...current, newItemRow()])}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Add item
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {rows.map((row, index) => (
                <div key={row.key} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_0.6fr_auto]">
                  <SelectField
                    label={`Product #${index + 1}`}
                    value={row.product_id}
                    onChange={(event) => updateRow(row.key, { product_id: event.target.value, variant_id: "" })}
                    options={products.map((option) => ({ value: option.uuid, label: `${option.name} · ${option.sku}` }))}
                    placeholder="Select product..."
                  />
                  <SelectField
                    label="Variant"
                    value={row.variant_id}
                    onChange={(event) => updateRow(row.key, { variant_id: event.target.value })}
                    options={variants
                      .filter((option) => !row.product_id || option.product_id === row.product_id)
                      .map((option) => ({ value: option.uuid, label: `${option.name} · ${option.sku}` }))}
                    placeholder="— No variant —"
                  />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Qty
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={row.qty}
                        onChange={(event) => updateRow(row.key, { qty: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                      />
                    </label>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      aria-label={`Remove item ${index + 1}`}
                      className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

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
              {isPending ? "Saving..." : "Create delivery order"}
            </button>
            <Link
              href={DELIVERY_ORDER_LIST_PATH}
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
