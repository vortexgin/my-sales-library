import type { ReactNode } from "react";
import { DashboardShell } from "@/app/dashboard/components/DashboardShell";
import { requireSession } from "@/libraries/Auth";

export default async function SalesLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();

  return (
    <DashboardShell session={{ user: session.user, permissions: session.permissions }}>
      {children}
    </DashboardShell>
  );
}
