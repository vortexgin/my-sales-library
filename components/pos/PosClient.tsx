"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PosSession } from "@/app/sales/models/PosSessionModel";
import type { PosTransaction } from "@/app/sales/models/PosTransactionModel";
import type { Product } from "@/app/product/models/ProductModel";
import type { Warehouse } from "@/app/warehouse/models/WarehouseModel";
import type { Customer } from "@/app/sales/models/CustomerModel";
import type { PosReceipt } from "@/libraries/mail";
import type { SessionInfo } from "@/libraries/Auth";
import { formatMoney } from "@/libraries/Currency";
import { getEncrypted, postEncrypted } from "@/libraries/EncryptedFetch";
import { SelectField, TextField } from "@/components/FormField";
import { ReceiptView } from "@/app/sales/components/pos/ReceiptView";

const SESSION_API = "/sales/api/v1/pos-sessions";
const TRANSACTION_API = "/sales/api/v1/pos-transactions";
const PRODUCT_API = "/product/api/v1/products";
const WAREHOUSE_API = "/warehouse/api/v1/warehouses";
const STOCK_API = "/warehouse/api/v1/stocks";
const CUSTOMER_API = "/sales/api/v1/customers";

type CartLine = {
  key: string;
  product_id: string;
  name: string;
  sku: string;
  unit_price: number;
  qty: number;
  discount_pct: number;
};

type CompletedSale = PosTransaction & {
  items?: unknown[];
  receipt: PosReceipt;
};

function newLineKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function lineTotal(line: Pick<CartLine, "qty" | "unit_price" | "discount_pct">): number {
  return Math.round(line.qty * line.unit_price * (1 - line.discount_pct / 100));
}

export function PosClient({
  session,
  initialSession,
}: {
  session: SessionInfo;
  initialSession: PosSession | null;
}) {
  const [activeSession, setActiveSession] = useState<PosSession | null>(initialSession);
  const [sessionLoading, setSessionLoading] = useState(initialSession === null);
  const [sessionError, setSessionError] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [closingNote, setClosingNote] = useState("");
  const [closing, setClosing] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [query, setQuery] = useState("");

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [warehousesError, setWarehousesError] = useState("");
  const [stockByProduct, setStockByProduct] = useState<Record<string, number>>({});

  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartDiscount, setCartDiscount] = useState("0");
  const [taxPct, setTaxPct] = useState("10");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);

  const [payment, setPayment] = useState<"cash" | "qris" | "transfer" | "debit_credit">("cash");
  const [cardLastFour, setCardLastFour] = useState("");
  const [tendered, setTendered] = useState("");
  const [fulfillment, setFulfillment] = useState<"system" | "paper">("system");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const [completed, setCompleted] = useState<CompletedSale | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors warehouseId for the mount effect without re-subscribing it.
  const warehouseIdRef = useRef("");

  const cashierLabel =
    typeof session.user?.name === "string" && session.user.name !== ""
      ? (session.user.name as string)
      : typeof session.user?.email === "string"
        ? (session.user.email as string)
        : activeSession?.opened_by.slice(0, 8) ?? "—";

  const openSession = useCallback(async () => {
    setSessionLoading(true);
    setSessionError("");
    try {
      const envelope = await postEncrypted<{ session: PosSession; already_open: boolean }>(`${SESSION_API}/open`, {});
      if (envelope.success && envelope.data?.session) {
        setActiveSession(envelope.data.session);
      } else {
        setSessionError(envelope.message || "Could not open a shift session.");
      }
    } catch {
      setSessionError("Something went wrong. Please try again.");
    } finally {
      setSessionLoading(false);
    }
  }, []);

  // Independent option fetches degrade per panel — a failed sibling never
  // blanks the cart. Also covers the entry join-or-create when the server
  // could not open (degraded boot): same mount sync, one effect.
  useEffect(() => {
    let active = true;
    (async () => {
      if (initialSession === null) {
        await openSession();
      }
      if (!active) {
        return;
      }
      const [warehousesResult] = await Promise.allSettled([
        getEncrypted<Warehouse[]>(`${WAREHOUSE_API}?limit=100&sortProperty=name&sortDirection=asc`),
      ]);
      if (!active) {
        return;
      }
      if (warehousesResult.status === "fulfilled" && warehousesResult.value.success) {
        const rows = warehousesResult.value.data ?? [];
        setWarehouses(rows);
        if (rows.length > 0 && warehouseIdRef.current === "") {
          warehouseIdRef.current = rows[0].uuid;
          setWarehouseId(rows[0].uuid);
          setStockByProduct({});
          setFulfillment("system");
        }
      } else {
        setWarehousesError("Could not load warehouses.");
      }
      if (warehousesResult.status !== "fulfilled" || !warehousesResult.value.success) {
        setProductsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [initialSession, openSession]);

  // Product discovery is warehouse-scoped: stock rows define membership,
  // while product rows provide authoritative labels and current prices.
  useEffect(() => {
    if (!warehouseId) {
      return;
    }
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
    }
    let active = true;
    const term = query.trim();
    const load = async () => {
      setProductsLoading(true);
      setProductsError("");
      const encodedTerm = encodeURIComponent(term);
      const [stocksResult, productsResult] = await Promise.allSettled([
        getEncrypted<Array<{ product_id: string; qty_on_hand: number; qty_reserved: number }>>(
          `${STOCK_API}?filter[warehouse_id]=${warehouseId}${term ? `&filter[q]=${encodedTerm}` : ""}&limit=100`,
        ),
        getEncrypted<Product[]>(
          `${PRODUCT_API}?filter[status]=active${term ? `&filter[q]=${encodedTerm}` : ""}&limit=100&sortProperty=name&sortDirection=asc`,
        ),
      ]);
      if (!active) {
        return;
      }
      if (
        stocksResult.status === "fulfilled" && stocksResult.value.success
        && productsResult.status === "fulfilled" && productsResult.value.success
      ) {
        const map: Record<string, number> = {};
        for (const row of stocksResult.value.data ?? []) {
          map[row.product_id] = (map[row.product_id] ?? 0) + (row.qty_on_hand ?? 0) - (row.qty_reserved ?? 0);
        }
        setStockByProduct(map);
        setProducts((productsResult.value.data ?? []).filter((product) => product.uuid in map));
      } else {
        setProducts([]);
        setStockByProduct({});
        setProductsError("Could not load products for the selected warehouse.");
      }
      setProductsLoading(false);
    };
    if (term) {
      searchTimer.current = setTimeout(load, 300);
    } else {
      void load();
    }
    return () => {
      active = false;
      if (searchTimer.current) {
        clearTimeout(searchTimer.current);
      }
    };
  }, [query, warehouseId]);

  // Debounced customer search (walk-in default, picker optional). Clearing
  // the query resets options in the input handler, so this effect only
  // searches and never resets.
  useEffect(() => {
    if (customerTimer.current) {
      clearTimeout(customerTimer.current);
    }
    const term = customerQuery.trim();
    if (term === "") {
      return;
    }
    customerTimer.current = setTimeout(async () => {
      setCustomersLoading(true);
      try {
        const envelope = await getEncrypted<Customer[]>(
          `${CUSTOMER_API}?filter[q]=${encodeURIComponent(term)}&limit=10`,
        );
        if (envelope.success) {
          setCustomerOptions(envelope.data ?? []);
        }
      } catch {
        setCustomerOptions([]);
      } finally {
        setCustomersLoading(false);
      }
    }, 300);
    return () => {
      if (customerTimer.current) {
        clearTimeout(customerTimer.current);
      }
    };
  }, [customerQuery]);

  function addProduct(product: Product) {
    setCart((current) => {
      const existing = current.find((line) => line.product_id === product.uuid);
      if (existing) {
        return current.map((line) =>
          line.key === existing.key ? { ...line, qty: line.qty + 1 } : line,
        );
      }
      return [
        ...current,
        {
          key: newLineKey(),
          product_id: product.uuid,
          name: product.name,
          sku: product.sku,
          unit_price: product.base_price,
          qty: 1,
          discount_pct: 0,
        },
      ];
    });
  }

  // Enter / barcode scan adds the first exact-SKU match.
  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const term = query.trim().toUpperCase();
    if (term === "") {
      return;
    }
    const exact = products.find((product) => product.sku.toUpperCase() === term);
    if (exact) {
      addProduct(exact);
      setQuery("");
    }
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setCart((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    setCart((current) => current.filter((line) => line.key !== key));
  }

  const subtotal = cart.reduce((sum, line) => sum + lineTotal(line), 0);
  const headerDiscount = Math.min(100, Math.max(0, Number(cartDiscount) || 0));
  const discountedTotal = Math.round(subtotal * (1 - headerDiscount / 100));
  const taxPercent = Math.min(100, Math.max(0, Number(taxPct) || 0));
  const taxAmount = Math.round(discountedTotal * (taxPercent / 100));
  const grandTotal = discountedTotal + taxAmount;
  const tenderedValue = tendered.trim() === "" ? null : Number(tendered);
  const changeValue =
    payment === "cash" && tenderedValue !== null && Number.isFinite(tenderedValue)
      ? Math.max(0, tenderedValue - grandTotal)
      : null;

  async function handlePay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (paying || productsLoading) {
      return;
    }
    if (cart.length === 0) {
      setPayError("The cart is empty.");
      return;
    }
    if (!warehouseId) {
      setPayError("Select a warehouse first.");
      return;
    }
    if (!activeSession || activeSession.status !== "open") {
      setPayError("No open shift session. Open a shift first.");
      return;
    }
    if (payment === "debit_credit" && !/^\d{4}$/.test(cardLastFour)) {
      setPayError("Enter exactly four numeric digits from the customer card.");
      return;
    }
    setPayError("");
    setPaying(true);
    try {
      const envelope = await postEncrypted<CompletedSale>(TRANSACTION_API, {
        session_id: activeSession.uuid,
        customer_id: customer?.uuid ?? null,
        warehouse_id: warehouseId,
        payment_method: payment,
        card_last_four: payment === "debit_credit" ? cardLastFour : null,
        tendered: payment === "cash" && tenderedValue !== null ? Math.trunc(tenderedValue) : null,
        discount_pct: headerDiscount,
        tax_pct: taxPercent,
        fulfillment,
        items: cart.map((line) => ({
          product_id: line.product_id,
          variant_id: null,
          qty: Math.trunc(line.qty),
          discount_pct: line.discount_pct,
        })),
      });
      if (!envelope.success || !envelope.data?.receipt) {
        setPayError(envelope.message || "Could not complete the sale.");
        return;
      }
      setCompleted(envelope.data);
      setCart([]);
      setTendered("");
      setCardLastFour("");
      setCartDiscount("0");
      setTaxPct("10");
      setCustomer(null);
      setCustomerQuery("");
    } catch {
      setPayError("Something went wrong. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  async function handleCloseShift() {
    if (closing || !activeSession) {
      return;
    }
    setClosing(true);
    setSessionError("");
    try {
      const payload: Record<string, unknown> = {};
      if (closingCash.trim() !== "") {
        payload.closing_cash = Math.trunc(Number(closingCash));
      }
      if (closingNote.trim() !== "") {
        payload.closing_note = closingNote.trim();
      }
      const envelope = await postEncrypted<PosSession>(`${SESSION_API}/${activeSession.uuid}/close`, payload);
      if (envelope.success && envelope.data) {
        setActiveSession(envelope.data);
        setClosingCash("");
        setClosingNote("");
      } else {
        setSessionError(envelope.message || "Could not close the shift.");
      }
    } catch {
      setSessionError("Something went wrong. Please try again.");
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Sales</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Point of sale.</h1>
          <p className="mt-2 text-sm text-slate-500">
            Ring up walk-in and customer sales in your shift session.
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Active shift</p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {sessionLoading
              ? "Opening your shift..."
              : activeSession && activeSession.status === "open"
                ? `${cashierLabel} · since ${new Date(activeSession.opened_at).toLocaleString()}`
                : activeSession
                  ? `Shift ${activeSession.status}`
                  : "No shift session"}
          </p>
        </div>
      </header>

      <section aria-label="Shift session" className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        {sessionLoading ? (
          <p className="text-sm text-slate-500">Opening your shift...</p>
        ) : activeSession && activeSession.status === "open" ? (
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-56">
              <SelectField
                label="Warehouse"
                value={warehouseId}
                onChange={(event) => {
                  const nextWarehouseId = event.target.value;
                  if (nextWarehouseId !== warehouseId) {
                    setCart([]);
                    setQuery("");
                  }
                  warehouseIdRef.current = nextWarehouseId;
                  setWarehouseId(nextWarehouseId);
                  setProducts([]);
                  setStockByProduct({});
                  setProductsLoading(Boolean(nextWarehouseId));
                  setFulfillment("system");
                }}
                options={warehouses.map((warehouse) => ({ value: warehouse.uuid, label: warehouse.name }))}
              />
            </div>
            <div className="min-w-64">
              <span className="mb-2 block text-sm font-medium text-slate-700">Stock handling</span>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2" role="radiogroup" aria-label="Fulfillment">
                {(["system", "paper"] as const).map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="fulfillment"
                      value={option}
                      checked={fulfillment === option}
                      onChange={() => setFulfillment(option)}
                      className="h-4 w-4 text-blue-600"
                    />
                    {option === "system" ? "System (deduct stock)" : "Paper (no deduction)"}
                  </label>
                ))}
              </div>
              {fulfillment === "paper" ? (
                <p role="status" className="mt-2 text-xs font-medium text-amber-700">
                  Stock will not be deducted.
                </p>
              ) : null}
            </div>
            <div className="w-36">
              <TextField
                label="Closing cash"
                type="number"
                min={0}
                value={closingCash}
                onChange={(event) => setClosingCash(event.target.value)}
                placeholder="e.g. 500000"
              />
            </div>
            <div className="min-w-40 flex-1">
              <TextField
                label="Closing note"
                type="text"
                value={closingNote}
                onChange={(event) => setClosingNote(event.target.value)}
                placeholder="Optional note"
              />
            </div>
            <button
              type="button"
              onClick={handleCloseShift}
              disabled={closing}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {closing ? "Closing..." : "Close shift"}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <p className="flex-1 text-sm text-slate-600">
              {activeSession ? `Shift ${activeSession.status}.` : "No shift session."} Open a shift to ring up sales.
            </p>
            <button
              type="button"
              onClick={openSession}
              disabled={sessionLoading}
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sessionLoading ? "Opening..." : "Open shift"}
            </button>
          </div>
        )}
        {sessionError ? (
          <p role="alert" className="mt-3 text-sm text-red-700">{sessionError}</p>
        ) : null}
        {warehousesError ? (
          <p role="alert" className="mt-3 text-sm text-red-700">{warehousesError}</p>
        ) : null}
      </section>

      {completed ? (
        <ReceiptView
          transactionUuid={completed.uuid}
          receipt={completed.receipt}
          onNewSale={() => setCompleted(null)}
        />
      ) : null}

      <form onSubmit={handlePay} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-label="Products" className="rounded-2xl border border-slate-200 p-4">
          <TextField
            label="Search products (name or SKU)"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Type to search, Enter adds exact SKU..."
            aria-label="Search products"
            disabled={!warehouseId}
          />
          {productsError ? (
            <p role="alert" className="mt-2 text-sm text-red-700">{productsError}</p>
          ) : null}
          {productsLoading && products.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Loading products...</p>
          ) : products.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              {warehouseId ? "No products found in this warehouse." : "Select a warehouse to view products."}
            </p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {products.map((product) => {
                const available = stockByProduct[product.uuid];
                return (
                  <li key={product.uuid}>
                    <button
                      type="button"
                      onClick={() => addProduct(product)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-blue-300 hover:bg-blue-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">{product.name}</span>
                        <span className="block text-xs text-slate-500">
                          {product.sku} · <span className="tabular-nums">{formatMoney(product.base_price)}</span>
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">
                        {typeof available === "number" ? `stock ${available}` : "stock —"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Cart" className="rounded-2xl border border-slate-200 p-4">
          {cart.length === 0 ? (
            <p className="text-sm text-slate-500">Cart is empty. Tap a product to add it.</p>
          ) : (
            <ul className="space-y-3">
              {cart.map((line) => (
                <li key={line.key} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{line.name}</p>
                      <p className="text-xs tabular-nums text-slate-500">
                        {formatMoney(line.unit_price)} × {line.qty} = {formatMoney(lineTotal(line))}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      aria-label={`Remove ${line.name}`}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-600">Qty</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={line.qty}
                        onChange={(event) =>
                          updateLine(line.key, { qty: Math.max(1, Math.trunc(Number(event.target.value)) || 1) })
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-blue-500"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-600">Price</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={line.unit_price}
                        readOnly
                        aria-readonly="true"
                        title="Price is set from the product catalog"
                        className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm tabular-nums text-slate-600"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-600">Disc %</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={line.discount_pct}
                        onChange={(event) =>
                          updateLine(line.key, {
                            discount_pct: Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-blue-500"
                      />
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-600">
                Customer (optional, walk-in default)
              </span>
              {customer ? (
                <p className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="truncate font-medium text-slate-900">{customer.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomer(null);
                      setCustomerQuery("");
                    }}
                    className="shrink-0 text-xs font-medium text-red-700 hover:underline"
                  >
                    Walk-in instead
                  </button>
                </p>
              ) : (
                <>
                  <input
                    type="search"
                    value={customerQuery}
                    onChange={(event) => {
                      setCustomerQuery(event.target.value);
                      if (event.target.value.trim() === "") {
                        setCustomerOptions([]);
                      }
                    }}
                    placeholder="Search customers..."
                    aria-label="Search customers"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                  {customersLoading ? (
                    <p className="mt-1 text-xs text-slate-500">Searching...</p>
                  ) : customerOptions.length > 0 ? (
                    <ul className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200">
                      {customerOptions.map((option) => (
                        <li key={option.uuid}>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomer(option);
                              setCustomerOptions([]);
                              setCustomerQuery("");
                            }}
                            className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                          >
                            {option.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </div>

            <div>
              <SelectField
                label="Payment"
                value={payment}
                onChange={(event) => {
                  const nextPayment = event.target.value as typeof payment;
                  setPayment(nextPayment);
                  if (nextPayment !== "debit_credit") {
                    setCardLastFour("");
                  }
                }}
                options={[
                  { value: "cash", label: "Cash" },
                  { value: "qris", label: "QRIS" },
                  { value: "transfer", label: "Transfer" },
                  { value: "debit_credit", label: "Debit / Credit" },
                ]}
              />
            </div>

            {payment === "cash" ? (
              <TextField
                label="Tendered"
                type="number"
                min={0}
                value={tendered}
                onChange={(event) => setTendered(event.target.value)}
                placeholder="Cash received"
              />
            ) : payment === "debit_credit" ? (
              <TextField
                label="Card last 4 digits"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4}"
                minLength={4}
                maxLength={4}
                required
                value={cardLastFour}
                onChange={(event) => setCardLastFour(event.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1234"
                hint="Enter only the final four digits shown on the customer card."
              />
            ) : null}

            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="tabular-nums">{formatMoney(subtotal)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Discount %</dt>
                <dd>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={cartDiscount}
                    onChange={(event) => setCartDiscount(event.target.value)}
                    aria-label="Cart discount percent"
                    className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-blue-500"
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Tax %</dt>
                <dd>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={taxPct}
                    onChange={(event) => setTaxPct(event.target.value)}
                    aria-label="Tax percent"
                    className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-blue-500"
                  />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Tax</dt>
                <dd className="tabular-nums">{formatMoney(taxAmount)}</dd>
              </div>
              <div className="flex justify-between gap-4 text-base">
                <dt className="font-semibold">Total</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(grandTotal)}</dd>
              </div>
              {changeValue !== null ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Change</dt>
                  <dd className="tabular-nums">{formatMoney(changeValue)}</dd>
                </div>
              ) : null}
            </dl>

            {payError ? (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {payError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={paying || productsLoading || cart.length === 0 || !warehouseId}
              className="inline-flex w-full items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {paying ? "Processing..." : `Pay ${formatMoney(grandTotal)}`}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
