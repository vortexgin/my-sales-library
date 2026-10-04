import Joi from "joi";
import { Op, UniqueConstraintError } from "sequelize";
import LeadStatusModelFactory, { LeadStatusModel, type LeadStatus, type UpdateLeadStatusInput } from "@/app/sales/models/LeadStatusModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";
import NotFoundException from "@/exceptions/NotFoundException";

const updateLeadStatusSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).optional(),
  description: Joi.string().trim().min(2).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).min(1);

export class LeadStatusUpdateUseCase extends BaseUseCase<string, LeadStatus, { uuid: string; input: UpdateLeadStatusInput; actor: ActivityActor }> {

  private leadStatusData?: LeadStatusModel | null;
  private beforeData?: LeadStatus | null;

  protected async preExec(uuid: string, input: UpdateLeadStatusInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateLeadStatusInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateLeadStatusInput>(updateLeadStatusSchema, input);

    await LeadStatusModelFactory();
    this.leadStatusData = await LeadStatusModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.leadStatusData) {
      throw new NotFoundException("Lead status not found")
    }
    this.beforeData = LeadStatusModel.toApi(this.leadStatusData?.toJSON());

    if (validatedInput.name?.trim()) {
      const nameTaken = await LeadStatusModel.findOne({
        where: {
          organization_id: this.beforeData?.organization_id ?? null,
          name: validatedInput.name.trim(),
          uuid: { [Op.ne]: uuid },
          deleted_at: null,
        },
      });
      if (nameTaken) {
        throw new DuplicateEntityException("A lead status with this name already exists.");
      }
    }

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateLeadStatusInput; actor: ActivityActor }): Promise<LeadStatus> {
    const { input } = context;
    const nextData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (typeof input.name === "string" && input.name.trim()) {
      nextData.name = input.name.trim();
    }

    if (typeof input.description === "string" && input.description.trim()) {
      nextData.description = input.description.trim();
    }

    if (input.status) {
      nextData.status = input.status;
      if (input.status === "deleted") {
        nextData.deleted_at = new Date();
      } else {
        nextData.deleted_at = null;
      }
    }

    await this.leadStatusData?.update(nextData).catch((error) => {
      // Lost a concurrent rename race against the (organization_id, name)
      // unique index: report the same 409 as the pre-update check.
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("A lead status with this name already exists.");
      }
      throw error;
    });

    return LeadStatusModel.toApi(this.leadStatusData?.toJSON());
  }

  protected async postExec(
    result: LeadStatus,
    context?: { uuid: string; input: UpdateLeadStatusInput; actor: ActivityActor },
  ): Promise<LeadStatus> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "lead_status",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
