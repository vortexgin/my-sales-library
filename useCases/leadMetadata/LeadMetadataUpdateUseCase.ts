import Joi from "joi";
import LeadMetadataModelFactory, { LeadMetadataModel, type LeadMetadata, type UpdateLeadMetadataInput } from "@/app/sales/models/LeadMetadataModel";
import LeadMetadataFieldModelFactory, { LeadMetadataFieldModel } from "@/app/sales/models/LeadMetadataFieldModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const updateLeadMetadataSchema = Joi.object({
  leads_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  lead_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  value: Joi.string().trim().min(1).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).min(1);

export class LeadMetadataUpdateUseCase extends BaseUseCase<string, LeadMetadata, { uuid: string; input: UpdateLeadMetadataInput; actor: ActivityActor }> {

  private leadMetadataData?: LeadMetadataModel | null;
  private beforeData?: LeadMetadata | null;

  protected async preExec(uuid: string, input: UpdateLeadMetadataInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateLeadMetadataInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateLeadMetadataInput>(updateLeadMetadataSchema, input);

    await LeadMetadataModelFactory();
    this.leadMetadataData = await LeadMetadataModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.leadMetadataData) {
      throw new NotFoundException("Lead metadata not found")
    }
    this.beforeData = LeadMetadataModel.toApi(this.leadMetadataData?.toJSON());

    if (validatedInput.lead_metadata_field_id) {
      await LeadMetadataFieldModelFactory();
      const field = await LeadMetadataFieldModel.findOne({ where: { uuid: validatedInput.lead_metadata_field_id, deleted_at: null } });
      if (!field) {
        throw new NotFoundException("Lead metadata field not found.");
      }
    }

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateLeadMetadataInput; actor: ActivityActor }): Promise<LeadMetadata> {
    const { input } = context;
    const nextData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (typeof input.lead_metadata_field_id === "string" && input.lead_metadata_field_id.trim()) {
      nextData.lead_metadata_field_id = input.lead_metadata_field_id;
    }

    if (Object.prototype.hasOwnProperty.call(input, "leads_id")) {
      nextData.leads_id = (input as Record<string, unknown>).leads_id ?? null;
    }

    if (typeof input.value === "string" && input.value.trim()) {
      nextData.value = input.value.trim();
    }

    if (input.status) {
      nextData.status = input.status;
      if (input.status === "deleted") {
        nextData.deleted_at = new Date();
      } else {
        nextData.deleted_at = null;
      }
    }

    await this.leadMetadataData?.update(nextData);

    return LeadMetadataModel.toApi(this.leadMetadataData?.toJSON());
  }

  protected async postExec(
    result: LeadMetadata,
    context?: { uuid: string; input: UpdateLeadMetadataInput; actor: ActivityActor },
  ): Promise<LeadMetadata> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "lead_metadata",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
