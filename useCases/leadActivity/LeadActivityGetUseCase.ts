import Joi from "joi";
import LeadActivityModelFactory, { LeadActivityModel, type LeadActivity } from "@/app/sales/models/LeadActivityModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getLeadActivitySchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class LeadActivityGetUseCase extends BaseUseCase<string, LeadActivity | null, string> {

  private leadActivityData?: LeadActivityModel | null;

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getLeadActivitySchema, { uuid });

    await LeadActivityModelFactory();
    this.leadActivityData = await LeadActivityModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.leadActivityData) {
      throw new NotFoundException("Lead activity not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<LeadActivity | null> {
    return LeadActivityModel.toApi(this.leadActivityData?.toJSON());
  }
}
