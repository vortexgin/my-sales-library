import Joi from "joi";
import LeadActivityModelFactory, { LeadActivityModel, type LeadActivity } from "@/app/sales/models/LeadActivityModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const deleteLeadActivitySchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});
export class LeadActivityDeleteUseCase extends BaseUseCase<string, boolean, { uuid: string; actor: ActivityActor }> {

  private leadActivityData?: LeadActivityModel | null;
  private beforeData?: LeadActivity | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const validatedUuid = await this.validate<{ uuid: string }>(deleteLeadActivitySchema, { uuid });

    await LeadActivityModelFactory();
    this.leadActivityData = await LeadActivityModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.leadActivityData) {
      throw new NotFoundException("Lead activity not found")
    }
    this.beforeData = LeadActivityModel.toApi(this.leadActivityData?.toJSON());
    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor }): Promise<boolean> {
    const { uuid } = context;
    await LeadActivityModelFactory();
    const [affectedRows] = await LeadActivityModel.update(
      {
        status: "deleted",
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
        entity: "lead_activity",
        entity_uuid: context?.uuid ?? null,
        origin: this.beforeData ?? null,
        updated: null,
      });
    }
    return super.postExec(result, context);
  }
}
