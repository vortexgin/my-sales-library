import Joi from "joi";
import LeadMetadataModelFactory, { LeadMetadataModel, type LeadMetadata } from "@/app/sales/models/LeadMetadataModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const deleteLeadMetadataSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});
export class LeadMetadataDeleteUseCase extends BaseUseCase<string, boolean, { uuid: string; actor: ActivityActor }> {

  private leadMetadataData?: LeadMetadataModel | null;
  private beforeData?: LeadMetadata | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const validatedUuid = await this.validate<{ uuid: string }>(deleteLeadMetadataSchema, { uuid });

    await LeadMetadataModelFactory();
    this.leadMetadataData = await LeadMetadataModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.leadMetadataData) {
      throw new NotFoundException("Lead metadata not found")
    }
    this.beforeData = LeadMetadataModel.toApi(this.leadMetadataData?.toJSON());
    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor }): Promise<boolean> {
    const { uuid } = context;
    await LeadMetadataModelFactory();
    const [affectedRows] = await LeadMetadataModel.update(
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
        entity: "lead_metadata",
        entity_uuid: context?.uuid ?? null,
        origin: this.beforeData ?? null,
        updated: null,
      });
    }
    return super.postExec(result, context);
  }
}
