"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/libraries/Currency";
import type { PosReceipt } from "@/libraries/mail";
import { postEncrypted } from "@/libraries/EncryptedFetch";

const SEND_RECEIPT_PATH = (uuid: string) => `/sales/api/v1/pos-transactions/${uuid}/send-receipt`;

export function ReceiptView({
  transactionUuid,
  receipt,
  onNewSale,
}: {
  transactionUuid: string;
  receipt: PosReceipt;
  onNewSale: () => void;
}) {
  const printedRef = useRef(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [sentAt, setSentAt] = useState<string | null>(receipt.sent_at);

  // Auto-print exactly once on mount (guard ref against StrictMode double-fire).
  useEffect(() => {
    if (printedRef.current) {
      return;
    }
    printedRef.current = true;
    if (receipt.channel === "print") {
      window.print();
    }
  }, [receipt.channel]);

  async function handleResend() {
    if (resending) {
      return;
    }
    setResending(true);
    setResendMessage("");
    try {
      const envelope = await postEncrypted<{ receipt_sent_at: string | null }>(SEND_RECEIPT_PATH(transactionUuid), {});
      if (envelope.success) {
        setSentAt(envelope.data?.receipt_sent_at ?? new Date().toISOString());
        setResendMessage("Receipt email sent.");
      } else {
        setResendMessage(envelope.message || "Could not send the receipt email.");
      }
    } catch {
      setResendMessage("Something went wrong. Please try again.");
    } finally {
      setResending(false);
    }
  }

  const emailPending = receipt.channel === "email" && !sentAt;

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <style media="print">{`
        body * { visibility: hidden; }
        .receipt-print, .receipt-print * { visibility: visible; }
        .receipt-print { position: absolute; left: 0; right: 0; top: 0; margin: 0 auto; max-width: 80mm; border: none !important; }
        .receipt-no-print { display: none !important; }
      `}</style>
      <div className="receipt-print mx-auto max-w-[80mm] text-sm text-slate-900">
        <p className="text-center text-base font-semibold">Receipt {receipt.receipt_no}</p>
        <p className="mt-1 text-center text-xs text-slate-500">{receipt.created_at}</p>
        <dl className="mt-4 space-y-1 text-[13px]">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Payment</dt>
            <dd className="font-medium">{receipt.payment_method}</dd>
          </div>
          {receipt.card_last_four ? (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Card ending</dt>
              <dd className="font-medium tabular-nums">•••• {receipt.card_last_four}</dd>
            </div>
          ) : null}
          {typeof receipt.tendered === "number" ? (
            <>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Tendered</dt>
                <dd className="font-medium tabular-nums">{formatMoney(receipt.tendered)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Change</dt>
                <dd className="font-medium tabular-nums">{formatMoney(receipt.change ?? 0)}</dd>
              </div>
            </>
          ) : null}
        </dl>
        <ul className="mt-4 space-y-2 border-t border-dashed border-slate-300 pt-3">
          {receipt.lines.map((line) => (
            <li key={`${line.product_id}-${line.variant_id ?? ""}`} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{line.product_name}</span>
                {line.variant_name ? (
                  <span className="block truncate text-xs text-slate-500">{line.variant_name}</span>
                ) : null}
                <span className="block text-xs text-slate-500">
                  {line.qty} × {formatMoney(line.unit_price)}
                  {line.discount_pct > 0 ? ` (−${line.discount_pct}%)` : ""}
                </span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">{formatMoney(line.line_total)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-dashed border-slate-300 pt-3 text-[13px]">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Subtotal</dt>
            <dd className="tabular-nums">{formatMoney(receipt.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Discount</dt>
            <dd className="tabular-nums">{receipt.discount_pct}%</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Tax ({receipt.tax_pct}%)</dt>
            <dd className="tabular-nums">{formatMoney(receipt.tax_amount)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-base">
            <dt className="font-semibold">Total</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(receipt.grand_total)}</dd>
          </div>
        </dl>
        {receipt.paper_stock_note ? (
          <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Paper sale — stock not deducted.
          </p>
        ) : null}
        {emailPending ? (
          <p role="status" className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            Email pending — receipt not sent yet. Print below as fallback or resend.
          </p>
        ) : null}
      </div>
      <div className="receipt-no-print mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          Reprint
        </button>
        {receipt.channel === "email" ? (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resending ? "Sending..." : "Resend email"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onNewSale}
          className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          New sale
        </button>
      </div>
      {resendMessage ? (
        <p role="status" className="receipt-no-print mt-3 text-sm text-slate-600">{resendMessage}</p>
      ) : null}
    </div>
  );
}
