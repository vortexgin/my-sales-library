import Joi from "joi";
import LeadStatusModelFactory, { LeadStatusModel, type LeadStatus } from "@/app/sales/models/LeadStatusModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getLeadStatusSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class LeadStatusGetUseCase extends BaseUseCase<string, LeadStatus | null, string> {

  private leadStatusData?: LeadStatusModel | null;

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getLeadStatusSchema, { uuid });

    await LeadStatusModelFactory();
    this.leadStatusData = await LeadStatusModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.leadStatusData) {
      throw new NotFoundException("Lead status not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<LeadStatus | null> {
    return LeadStatusModel.toApi(this.leadStatusData?.toJSON());
  }
}
