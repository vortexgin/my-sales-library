import Joi from "joi";
import LeadMetadataModelFactory, { LeadMetadataModel, type LeadMetadata } from "@/app/sales/models/LeadMetadataModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getLeadMetadataSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class LeadMetadataGetUseCase extends BaseUseCase<string, LeadMetadata | null, string> {

  private leadMetadataData?: LeadMetadataModel | null;

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getLeadMetadataSchema, { uuid });

    await LeadMetadataModelFactory();
    this.leadMetadataData = await LeadMetadataModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.leadMetadataData) {
      throw new NotFoundException("Lead metadata not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<LeadMetadata | null> {
    return LeadMetadataModel.toApi(this.leadMetadataData?.toJSON());
  }
}
