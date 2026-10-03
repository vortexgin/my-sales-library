import Joi from "joi";
import LeadMetadataFieldModelFactory, { LeadMetadataFieldModel, type LeadMetadataField } from "@/app/sales/models/LeadMetadataFieldModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getLeadMetadataFieldSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class LeadMetadataFieldGetUseCase extends BaseUseCase<string, LeadMetadataField | null, string> {

  private leadMetadataFieldData?: LeadMetadataFieldModel | null;

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getLeadMetadataFieldSchema, { uuid });

    await LeadMetadataFieldModelFactory();
    this.leadMetadataFieldData = await LeadMetadataFieldModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.leadMetadataFieldData) {
      throw new NotFoundException("Lead metadata field not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<LeadMetadataField | null> {
    return LeadMetadataFieldModel.toApi(this.leadMetadataFieldData?.toJSON());
  }
}
