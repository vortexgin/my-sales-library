import { randomUUID } from "crypto";
import Joi from "joi";
import LeadMetadataModelFactory, { LeadMetadataModel, type CreateLeadMetadataInput, type LeadMetadata } from "@/app/sales/models/LeadMetadataModel";
import LeadMetadataFieldModelFactory, { LeadMetadataFieldModel } from "@/app/sales/models/LeadMetadataFieldModel";
import LeadModelFactory, { LeadModel } from "@/app/sales/models/LeadModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const createLeadMetadataSchema = Joi.object({
  leads_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  lead_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  value: Joi.string().trim().min(1).required(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
});

export class LeadMetadataCreateUseCase extends BaseUseCase<CreateLeadMetadataInput, LeadMetadata, { input: CreateLeadMetadataInput; actor: ActivityActor }> {
  protected async preExec(input: CreateLeadMetadataInput, actor?: ActivityActor): Promise<{ input: CreateLeadMetadataInput; actor: ActivityActor }> {
    const validated = await this.validate<CreateLeadMetadataInput>(createLeadMetadataSchema, input);

    await LeadMetadataFieldModelFactory();
    const field = await LeadMetadataFieldModel.findOne({ where: { uuid: validated.lead_metadata_field_id, deleted_at: null } });
    if (!field) {
      throw new NotFoundException("Lead metadata field not found.");
    }

    if (validated.leads_id) {
      await LeadModelFactory();
      const lead = await LeadModel.findOne({ where: { uuid: validated.leads_id, deleted_at: null } });
      if (!lead) {
        throw new NotFoundException("Lead not found.");
      }
    }

    return { input: validated, actor: actor ?? null };
  }

  protected async execute(context: { input: CreateLeadMetadataInput; actor: ActivityActor }): Promise<LeadMetadata> {
    const { input } = context;
    await LeadMetadataModelFactory();
    const row = await LeadMetadataModel.create({
      uuid: randomUUID(),
      leads_id: input.leads_id ?? null,
      lead_metadata_field_id: input.lead_metadata_field_id,
      value: input.value?.trim(),
      status: input.status ?? "active",
      deleted_at: null,
    });

    return LeadMetadataModel.toApi(row.toJSON());
  }

  protected async postExec(
    result: LeadMetadata,
    context?: { input: CreateLeadMetadataInput; actor: ActivityActor },
  ): Promise<LeadMetadata> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "lead_metadata",
      entity_uuid: result.uuid,
      origin: null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
