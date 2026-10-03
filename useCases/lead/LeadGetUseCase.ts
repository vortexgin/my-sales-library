import Joi from "joi";
import LeadModelFactory, { LeadModel, type Lead } from "@/app/sales/models/LeadModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getLeadSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class LeadGetUseCase extends BaseUseCase<string, Lead | null, string> {

  private leadData?: LeadModel | null;

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getLeadSchema, { uuid });

    await LeadModelFactory();
    this.leadData = await LeadModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.leadData) {
      throw new NotFoundException("Lead not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<Lead | null> {
    return LeadModel.toApi(this.leadData?.toJSON());
  }
}
