import Joi from "joi";
import { Op, UniqueConstraintError } from "sequelize";
import LeadMetadataFieldModelFactory, { LeadMetadataFieldModel, type LeadMetadataField, type UpdateLeadMetadataFieldInput } from "@/app/sales/models/LeadMetadataFieldModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";
import NotFoundException from "@/exceptions/NotFoundException";

const updateLeadMetadataFieldSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).optional(),
  description: Joi.string().trim().min(2).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).min(1);

export class LeadMetadataFieldUpdateUseCase extends BaseUseCase<string, LeadMetadataField, { uuid: string; input: UpdateLeadMetadataFieldInput; actor: ActivityActor }> {

  private leadMetadataFieldData?: LeadMetadataFieldModel | null;
  private beforeData?: LeadMetadataField | null;

  protected async preExec(uuid: string, input: UpdateLeadMetadataFieldInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateLeadMetadataFieldInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateLeadMetadataFieldInput>(updateLeadMetadataFieldSchema, input);

    await LeadMetadataFieldModelFactory();
    this.leadMetadataFieldData = await LeadMetadataFieldModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.leadMetadataFieldData) {
      throw new NotFoundException("Lead metadata field not found")
    }
    this.beforeData = LeadMetadataFieldModel.toApi(this.leadMetadataFieldData?.toJSON());

    if (validatedInput.name?.trim()) {
      const nameTaken = await LeadMetadataFieldModel.findOne({
        where: {
          organization_id: this.beforeData?.organization_id ?? null,
          name: validatedInput.name.trim(),
          uuid: { [Op.ne]: uuid },
          deleted_at: null,
        },
      });
      if (nameTaken) {
        throw new DuplicateEntityException("A lead metadata field with this name already exists.");
      }
    }

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateLeadMetadataFieldInput; actor: ActivityActor }): Promise<LeadMetadataField> {
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

    await this.leadMetadataFieldData?.update(nextData).catch((error) => {
      // Lost a concurrent rename race against the (organization_id, name)
      // unique index: report the same 409 as the pre-update check.
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("A lead metadata field with this name already exists.");
      }
      throw error;
    });

    return LeadMetadataFieldModel.toApi(this.leadMetadataFieldData?.toJSON());
  }

  protected async postExec(
    result: LeadMetadataField,
    context?: { uuid: string; input: UpdateLeadMetadataFieldInput; actor: ActivityActor },
  ): Promise<LeadMetadataField> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "lead_metadata_field",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
