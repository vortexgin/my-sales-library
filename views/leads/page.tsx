import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { LeadBoard } from "@/app/sales/components/lead/LeadBoard";
import { requireSession } from "@/libraries/Auth";

export const metadata: Metadata = {
  title: "Leads | VortexGin",
};

export default async function LeadListPage() {
  const session = await requireSession();

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:lead:list:list"]}
      accessDeniedComponent={<AccessDenied />}
    >
      <div className="w-full">
        <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-600">Sales</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Leads.</h1>
              <p className="mt-2 text-sm text-slate-500">
                Pipeline board grouped by your organization&apos;s lead statuses. Drag cards to update status.
              </p>
            </div>
          </div>

          <Suspense fallback={<p className="mt-6 text-sm text-slate-500">Loading board...</p>}>
            <LeadBoard session={session} />
          </Suspense>
        </div>
      </div>
    </AuthComponent>
  );
}
