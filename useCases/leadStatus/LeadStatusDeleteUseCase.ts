import Joi from "joi";
import LeadStatusModelFactory, { LeadStatusModel, type LeadStatus } from "@/app/sales/models/LeadStatusModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const deleteLeadStatusSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});
export class LeadStatusDeleteUseCase extends BaseUseCase<string, boolean, { uuid: string; actor: ActivityActor }> {

  private leadStatusData?: LeadStatusModel | null;
  private beforeData?: LeadStatus | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const validatedUuid = await this.validate<{ uuid: string }>(deleteLeadStatusSchema, { uuid });

    await LeadStatusModelFactory();
    this.leadStatusData = await LeadStatusModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.leadStatusData) {
      throw new NotFoundException("Lead status not found")
    }
    this.beforeData = LeadStatusModel.toApi(this.leadStatusData?.toJSON());
    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor }): Promise<boolean> {
    const { uuid } = context;
    await LeadStatusModelFactory();
    const [affectedRows] = await LeadStatusModel.update(
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
        entity: "lead_status",
        entity_uuid: context?.uuid ?? null,
        origin: this.beforeData ?? null,
        updated: null,
      });
    }
    return super.postExec(result, context);
  }
}
