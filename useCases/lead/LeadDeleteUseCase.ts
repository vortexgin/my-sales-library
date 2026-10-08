import Joi from "joi";
import LeadModelFactory, { LeadModel, type Lead } from "@/app/sales/models/LeadModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const deleteLeadSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});
export class LeadDeleteUseCase extends BaseUseCase<string, boolean, { uuid: string; actor: ActivityActor }> {

  private leadData?: LeadModel | null;
  private beforeData?: Lead | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const validatedUuid = await this.validate<{ uuid: string }>(deleteLeadSchema, { uuid });

    await LeadModelFactory();
    this.leadData = await LeadModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.leadData) {
      throw new NotFoundException("Lead not found")
    }
    // Same-org only (unlinked actors see unlinked rows); 404 to avoid
    // leaking cross-org existence — mirrors LeadConvertUseCase.
    const deleteActorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const deleteOrgId =
      typeof deleteActorUuid === "string" ? ((await UserModel.resolveOrganization(deleteActorUuid))?.uuid ?? null) : null;
    if ((this.leadData.organization_id ?? null) !== deleteOrgId) {
      throw new NotFoundException("Lead not found")
    }
    this.beforeData = LeadModel.toApi(this.leadData?.toJSON());
    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor }): Promise<boolean> {
    const { uuid } = context;
    await LeadModelFactory();
    const [affectedRows] = await LeadModel.update(
      {
        deleted_at: new Date(),
        updated_at: new Date(),
      },
      {
        where: { uuid, deleted_at: null },
      },
    );

    return affectedRows > 0;
  }

  protected async postExec(
    result: boolean,
    context?: { uuid: string; actor: ActivityActor },
  ): Promise<boolean> {
    if (result) {
      void recordActivityLog({
        actor: context?.actor ?? null,
        operation: "delete",
        entity: "lead",
        entity_uuid: context?.uuid ?? null,
        origin: this.beforeData ?? null,
        updated: null,
      });
    }
    return super.postExec(result, context);
  }
}
