"use client";

import { SelectField, TextField } from "@/components/FormField";
import { formatMoney } from "@/libraries/Currency";
import type { Product } from "@/app/product/models/ProductModel";
import type { ProductVariant } from "@/app/product/models/ProductVariantModel";

export type OrderItemRow = {
  key: string;
  uuid?: string;
  product_id: string;
  variant_id: string;
  qty: string;
  unit_price: string;
  discount_pct: string;
  notes: string;
};

export function newOrderItemRow(): OrderItemRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    product_id: "",
    variant_id: "",
    qty: "1",
    unit_price: "",
    discount_pct: "",
    notes: "",
  };
}

export function orderLineTotal(row: OrderItemRow): number {
  const qty = Number(row.qty) || 0;
  const price = Number(row.unit_price) || 0;
  const discount = Number(row.discount_pct) || 0;
  return Math.round(qty * price * (1 - discount / 100));
}

/**
 * Item rows editor shared by the PR and SO forms. The parent owns rows state
 * and submits; this only renders. Products/variants come pre-fetched from the
 * parent so option fetches degrade once, not per row.
 */
export function OrderItemsEditor({
  rows,
  setRows,
  products,
  variants,
}: {
  rows: OrderItemRow[];
  setRows: (rows: OrderItemRow[]) => void;
  products: Product[];
  variants: ProductVariant[];
}) {
  function updateRow(key: string, patch: Partial<OrderItemRow>) {
    setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    setRows(rows.filter((row) => row.key !== key));
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Items</h2>
          <p className="mt-0.5 text-xs text-slate-500">Prices come from the client; the server snapshots totals.</p>
        </div>
        <button
          type="button"
          onClick={() => setRows([...rows, newOrderItemRow()])}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Add item
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">No items yet. Add at least one.</p>
        ) : null}
        {rows.map((row, index) => {
          const variantItems = variants.filter((option) => !row.product_id || option.product_id === row.product_id);
          return (
            <div key={row.key} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
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
                options={variantItems.map((option) => ({ value: option.uuid, label: `${option.name} · ${option.sku}` }))}
                placeholder="— No variant —"
              />
              <TextField
                label="Qty"
                type="number"
                min={1}
                step={1}
                value={row.qty}
                onChange={(event) => updateRow(row.key, { qty: event.target.value })}
              />
              <TextField
                label="Unit price"
                type="number"
                min={0}
                step={1}
                value={row.unit_price}
                onChange={(event) => updateRow(row.key, { unit_price: event.target.value })}
                placeholder="0"
              />
              <TextField
                label="Discount %"
                type="number"
                min={0}
                max={100}
                step="any"
                value={row.discount_pct}
                onChange={(event) => updateRow(row.key, { discount_pct: event.target.value })}
                placeholder="0"
              />
              <div className="flex items-end gap-2">
                <div className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm tabular-nums text-slate-700">
                  Line: {formatMoney(orderLineTotal(row))}
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  aria-label={`Remove item ${index + 1}`}
                  className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
              <div className="sm:col-span-2">
                <TextField
                  label="Item notes"
                  value={row.notes}
                  onChange={(event) => updateRow(row.key, { notes: event.target.value })}
                  placeholder="Optional note..."
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
