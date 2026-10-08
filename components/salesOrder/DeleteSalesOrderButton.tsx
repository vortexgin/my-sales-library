"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEncrypted } from "@/libraries/EncryptedFetch";

export function DeleteSalesOrderButton({
  uuid,
  label,
  redirectTo,
}: {
  uuid: string;
  label: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleClick() {
    if (!window.confirm(`Delete sales order "${label}"? This marks it as deleted.`)) {
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const envelope = await deleteEncrypted<{ message: string }>(
          `/sales/api/v1/sales-orders/${uuid}`,
        );
        if (!envelope.success) {
          setError(envelope.message || "Failed to delete sales order.");
          return;
        }
        if (redirectTo) {
          router.push(redirectTo);
        } else {
          router.refresh();
        }
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Deleting..." : "Delete"}
      </button>
      {error ? (
        <span role="alert" className="max-w-48 text-xs text-red-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}
