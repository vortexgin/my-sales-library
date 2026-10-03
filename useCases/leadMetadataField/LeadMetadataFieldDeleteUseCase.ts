import Joi from "joi";
import LeadMetadataFieldModelFactory, { LeadMetadataFieldModel, type LeadMetadataField } from "@/app/sales/models/LeadMetadataFieldModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const deleteLeadMetadataFieldSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});
export class LeadMetadataFieldDeleteUseCase extends BaseUseCase<string, boolean, { uuid: string; actor: ActivityActor }> {

  private leadMetadataFieldData?: LeadMetadataFieldModel | null;
  private beforeData?: LeadMetadataField | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const validatedUuid = await this.validate<{ uuid: string }>(deleteLeadMetadataFieldSchema, { uuid });

    await LeadMetadataFieldModelFactory();
    this.leadMetadataFieldData = await LeadMetadataFieldModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.leadMetadataFieldData) {
      throw new NotFoundException("Lead metadata field not found")
    }
    this.beforeData = LeadMetadataFieldModel.toApi(this.leadMetadataFieldData?.toJSON());
    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor }): Promise<boolean> {
    const { uuid } = context;
    await LeadMetadataFieldModelFactory();
    const [affectedRows] = await LeadMetadataFieldModel.update(
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
        entity: "lead_metadata_field",
        entity_uuid: context?.uuid ?? null,
        origin: this.beforeData ?? null,
        updated: null,
      });
    }
    return super.postExec(result, context);
  }
}
