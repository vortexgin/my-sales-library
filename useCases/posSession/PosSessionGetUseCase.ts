import Joi from "joi";
import PosSessionModelFactory, { PosSessionModel, type PosSession } from "@/app/sales/models/PosSessionModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getPosSessionSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class PosSessionGetUseCase extends BaseUseCase<string, PosSession, string> {
  private sessionData?: PosSessionModel | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<string> {
    const validated = await this.validate<{ uuid: string }>(getPosSessionSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await PosSessionModelFactory();
    this.sessionData = await PosSessionModel.findOne({
      where: { uuid: validated.uuid, deleted_at: null },
    });
    // Same-org only (unlinked actors see unlinked rows); 404 to avoid
    // leaking cross-org existence.
    if (!this.sessionData || (this.sessionData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("POS session not found.");
    }

    return validated.uuid;
  }

  protected async execute(): Promise<PosSession> {
    if (!this.sessionData) {
      throw new NotFoundException("POS session not found.");
    }
    return PosSessionModel.toApi(this.sessionData.toJSON());
  }
}
