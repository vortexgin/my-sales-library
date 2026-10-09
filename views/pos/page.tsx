import type { Metadata } from "next";
import { AuthComponent } from "@/components/AuthComponent";
import { AccessDenied } from "@/components/AccessDenied";
import { PosClient } from "@/app/sales/components/pos/PosClient";
import { PosSessionOpenUseCase } from "@/app/sales/useCases/posSession/PosSessionOpenUseCase";
import { connectDatabase } from "@/database/sequelize";
import { requireSession } from "@/libraries/Auth";
import { hasPermission } from "@/libraries/Permissions";

export const metadata: Metadata = {
  title: "Point of sale | VortexGin",
};

export default async function PosPage() {
  const session = await requireSession();

  // POS entry check: join-or-create the cashier's own session. Only
  // attempted for permitted cashiers; the gate below still owns the UI.
  let initialSession = null;
  if (hasPermission(session.user, session.permissions, ["sales:pos-transaction:create:create"])) {
    try {
      await connectDatabase();
      const result = await new PosSessionOpenUseCase().exec(
        { opening_cash: 0 },
        session.user,
      );
      initialSession = result.session;
    } catch {
      initialSession = null;
    }
  }

  return (
    <AuthComponent
      user={session.user}
      permissions={session.permissions}
      allowedPermissions={["sales:pos-transaction:create:create"]}
      accessDeniedComponent={
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <AccessDenied />
        </main>
      }
    >
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full">
          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-8">
            <PosClient session={session} initialSession={initialSession} />
          </div>
        </div>
      </main>
    </AuthComponent>
  );
}
