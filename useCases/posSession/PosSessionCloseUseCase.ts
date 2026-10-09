import Joi from "joi";
import PosSessionModelFactory, { PosSessionModel, type ClosePosSessionInput, type PosSession } from "@/app/sales/models/PosSessionModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import ForbiddenException from "@/exceptions/ForbiddenException";
import NotFoundException from "@/exceptions/NotFoundException";

const closePosSessionSchema = Joi.object({
  closing_cash: Joi.number().integer().min(0).allow(null).optional(),
  closing_note: Joi.string().trim().allow("", null).optional(),
  force: Joi.boolean().default(false),
}).unknown(false);

export class PosSessionCloseUseCase extends BaseUseCase<string, PosSession, { uuid: string; input: ClosePosSessionInput; actor: ActivityActor }> {
  private sessionData?: PosSessionModel | null;
  private beforeData?: PosSession | null;

  protected async preExec(uuid: string, input: ClosePosSessionInput, actor?: ActivityActor): Promise<{ uuid: string; input: ClosePosSessionInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<ClosePosSessionInput>(closePosSessionSchema, input ?? {});

    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await PosSessionModelFactory();
    this.sessionData = await PosSessionModel.findOne({
      where: { uuid: validatedUuid.uuid, deleted_at: null },
    });
    if (!this.sessionData || (this.sessionData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("POS session not found.");
    }
    this.beforeData = PosSessionModel.toApi(this.sessionData.toJSON());

    if (this.beforeData.status !== "open") {
      throw new BadParameterException(`Only the active session can be closed (status is ${this.beforeData.status}).`);
    }

    // Owner-only: another cashier's shift stays untouched. Admins may
    // override explicitly with force:true; anything else is 403.
    if (typeof actorUuid !== "string" || this.beforeData.opened_by !== actorUuid) {
      const isAdmin = await UserModel.isAdmin(actor);
      if (!validatedInput.force || !isAdmin) {
        throw new ForbiddenException("Only the session owner can close this shift.");
      }
    }

    return { uuid: validatedUuid.uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: ClosePosSessionInput; actor: ActivityActor }): Promise<PosSession> {
    const { input } = context;
    await this.sessionData?.update({
      status: "closed",
      closed_at: new Date(),
      closing_cash: typeof input.closing_cash === "number" ? input.closing_cash : null,
      closing_note: input.closing_note?.trim() || null,
      updated_at: new Date(),
    });

    return PosSessionModel.toApi(this.sessionData?.toJSON());
  }

  protected async postExec(
    result: PosSession,
    context?: { uuid: string; input: ClosePosSessionInput; actor: ActivityActor },
  ): Promise<PosSession> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "pos_session",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
