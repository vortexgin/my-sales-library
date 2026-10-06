import Joi from "joi";
import LeadModelFactory, { LeadModel, type Lead } from "@/app/sales/models/LeadModel";
import UserModelFactory, { UserModel } from "@/app/base/models/UserModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getLeadSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

/**
 * Assignee label comes from an eager-loaded association, not a stored
 * snapshot. Base module is a hard dependency of sales (static import),
 * but association setup stays guarded (single registration) and a setup
 * failure degrades to a plain row read with a null assignee.
 */
async function buildRelationIncludes(): Promise<any[]> {
  try {
    await UserModelFactory();
    const associations = (LeadModel as any).associations ?? {};
    if (!associations.assignee) {
      LeadModel.belongsTo(UserModel, {
        foreignKey: "assigned_to",
        targetKey: "uuid",
        as: "assignee",
        constraints: false,
      });
    }
    return [
      { model: UserModel, as: "assignee", required: false },
    ];
  } catch {
    return [];
  }
}

export class LeadGetUseCase extends BaseUseCase<string, Lead | null, string> {

  private leadData?: LeadModel | null;

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getLeadSchema, { uuid });

    await LeadModelFactory();
    this.leadData = await LeadModel.findOne({
      where: { uuid: validatedUuid.uuid, deleted_at: null },
      include: await buildRelationIncludes(),
    });
    if (!this.leadData) {
      throw new NotFoundException("Lead not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<Lead | null> {
    return LeadModel.toApi(this.leadData?.toJSON());
  }
}
