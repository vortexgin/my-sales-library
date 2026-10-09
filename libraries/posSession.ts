import { Op } from "sequelize";
import PosSessionModelFactory, { PosSessionModel } from "@/app/sales/models/PosSessionModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";

/**
 * Lazy midnight close (no cron V1): flips every `open` session of the
 * organization opened before today's midnight to `auto_closed`. Runs at
 * the top of session `open` and sale `preExec` so a new shift always
 * opens fresh with the same semantics a scheduler would enforce.
 */
export async function closeStaleSessions(
  organizationId: string | null,
  actor?: ActivityActor,
): Promise<number> {
  await PosSessionModelFactory();
  const midnight = PosSessionModel.startOfToday();
  const stale = await PosSessionModel.findAll({
    where: {
      organization_id: organizationId,
      status: "open",
      opened_at: { [Op.lt]: midnight },
      deleted_at: null,
    },
  });

  for (const session of stale) {
    const before = PosSessionModel.toApi(session.toJSON());
    await session.update({ status: "auto_closed", closed_at: midnight, updated_at: new Date() });
    const after = PosSessionModel.toApi(session.toJSON());
    void recordActivityLog({
      actor: actor ?? null,
      operation: "update",
      entity: "pos_session",
      entity_uuid: session.uuid,
      origin: before as unknown as Record<string, unknown>,
      updated: after as unknown as Record<string, unknown>,
    });
  }

  return stale.length;
}
