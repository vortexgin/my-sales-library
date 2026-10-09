import Joi from "joi";
import { randomUUID } from "crypto";
import { UniqueConstraintError } from "sequelize";
import PosSessionModelFactory, { PosSessionModel, type OpenPosSessionInput, type PosSession } from "@/app/sales/models/PosSessionModel";
import { closeStaleSessions } from "@/app/sales/libraries/posSession";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import ForbiddenException from "@/exceptions/ForbiddenException";

const openPosSessionSchema = Joi.object({
  opening_cash: Joi.number().integer().min(0).default(0),
  notes: Joi.string().trim().allow("", null).optional(),
}).unknown(false);

export type PosSessionOpenResult = {
  session: PosSession;
  already_open: boolean;
};

export class PosSessionOpenUseCase extends BaseUseCase<OpenPosSessionInput, PosSessionOpenResult, { input: OpenPosSessionInput; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(input: OpenPosSessionInput, actor?: ActivityActor): Promise<{ input: OpenPosSessionInput; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<OpenPosSessionInput>(openPosSessionSchema, input ?? {});

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    if (typeof actorUuid !== "string") {
      throw new ForbiddenException("Only signed-in cashiers can open a POS session.");
    }
    const organizationId =
      (await UserModel.resolveOrganization(actorUuid))?.uuid ?? null;

    // Lazy midnight close so a new shift never inherits yesterday's session.
    await closeStaleSessions(organizationId, actor ?? null);

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { input: OpenPosSessionInput; actor: ActivityActor; organizationId: string | null }): Promise<PosSessionOpenResult> {
    const { input, actor, organizationId } = context;
    const actorUuid = (actor as Record<string, unknown> | null)?.uuid as string;
    await PosSessionModelFactory();

    const existing = await PosSessionModel.findOne({
      where: { organization_id: organizationId, opened_by: actorUuid, status: "open", deleted_at: null },
    });
    if (existing) {
      return { session: PosSessionModel.toApi(existing.toJSON()), already_open: true };
    }

    try {
      const row = await PosSessionModel.create({
        uuid: randomUUID(),
        organization_id: organizationId ?? null,
        opened_by: actorUuid,
        opened_at: new Date(),
        status: "open",
        opening_cash: input.opening_cash ?? 0,
        notes: input.notes?.trim() || null,
        deleted_at: null,
      });
      return { session: PosSessionModel.toApi(row.toJSON()), already_open: false };
    } catch (error) {
      // Lost a join-or-create race: the other request won the partial
      // unique index, so return its session as already open.
      if (error instanceof UniqueConstraintError) {
        const winner = await PosSessionModel.findOne({
          where: { organization_id: organizationId, opened_by: actorUuid, status: "open", deleted_at: null },
        });
        if (winner) {
          return { session: PosSessionModel.toApi(winner.toJSON()), already_open: true };
        }
      }
      throw error;
    }
  }

  protected async postExec(
    result: PosSessionOpenResult,
    context?: { input: OpenPosSessionInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<PosSessionOpenResult> {
    if (!result.already_open) {
      void recordActivityLog({
        actor: context?.actor ?? null,
        operation: "create",
        entity: "pos_session",
        entity_uuid: result.session.uuid,
        origin: null,
        updated: result.session as unknown as Record<string, unknown>,
      });
    }
    return super.postExec(result, context);
  }
}
