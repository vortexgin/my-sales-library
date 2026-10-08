"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postEncrypted } from "@/libraries/EncryptedFetch";
import type { DeliveryOrder } from "@/app/sales/models/DeliveryOrderModel";

/**
 * Ship control for the DO detail page. System posts stock movements through
 * the warehouse module; paper records the shipment without touching stock
 * (persistent banner territory on the detail view).
 */
export function ShipDeliveryOrderButton({
  uuid,
  status,
  fulfillment,
  stockDeducted,
}: {
  uuid: string;
  status: string;
  fulfillment: string | null;
  stockDeducted: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"system" | "paper">("system");
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  if (status === "cancelled" || status === "delivered") {
    return null;
  }
  if (status === "shipped" && fulfillment === "system" && stockDeducted) {
    return (
      <span className="inline-flex items-center rounded-xl bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700 ring-1 ring-inset ring-green-200">
        Shipped · stock posted
      </span>
    );
  }

  async function handleShip() {
    if (isPending) {
      return;
    }
    if (mode === "paper" && !window.confirm("Ship as paper? Stock will NOT be deducted.")) {
      return;
    }
    setError("");
    setIsPending(true);
    try {
      const envelope = await postEncrypted<DeliveryOrder>(`/sales/api/v1/delivery-orders/${uuid}/ship`, {
        fulfillment: mode,
      });
      if (!envelope.success) {
        setError(envelope.message || "Failed to ship delivery order.");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="inline-flex items-center gap-2">
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as "system" | "paper")}
          aria-label="Fulfillment"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-500"
        >
          <option value="system">system — post stock</option>
          <option value="paper">paper — no stock move</option>
        </select>
        <button
          type="button"
          onClick={handleShip}
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
        >
          {isPending ? "Shipping..." : "Ship"}
        </button>
      </span>
      {error ? (
        <span role="alert" className="max-w-64 text-xs text-red-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}
