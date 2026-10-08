"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postEncrypted } from "@/libraries/EncryptedFetch";

/**
 * Converts a lead into a customer. Idempotent server-side: converting twice
 * returns the existing customer (`already_existed`) instead of duplicating.
 */
export function LeadConvertButton({
  leadUuid,
  label,
}: {
  leadUuid: string;
  label: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    if (!window.confirm(`Convert lead "${label}" to a customer?`)) {
      return;
    }
    if (isPending) {
      return;
    }
    setError("");
    setIsPending(true);
    try {
      const envelope = await postEncrypted<{ customer: { uuid: string }; already_existed: boolean }>(
        "/sales/api/v1/customers/convert",
        { lead_id: leadUuid },
      );
      if (!envelope.success) {
        setError(envelope.message || "Failed to convert lead.");
        return;
      }
      router.push(`/sales/views/customers/${envelope.data.customer.uuid}?converted=1`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Converting..." : "Convert to customer"}
      </button>
      {error ? (
        <span role="alert" className="max-w-48 text-xs text-red-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}
