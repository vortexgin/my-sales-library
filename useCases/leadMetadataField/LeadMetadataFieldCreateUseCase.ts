import { randomUUID } from "crypto";
import Joi from "joi";
import { UniqueConstraintError } from "sequelize";
import LeadMetadataFieldModelFactory, { LeadMetadataFieldModel, type CreateLeadMetadataFieldInput, type LeadMetadataField } from "@/app/sales/models/LeadMetadataFieldModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";

const createLeadMetadataFieldSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  description: Joi.string().trim().min(2).required(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
});

export class LeadMetadataFieldCreateUseCase extends BaseUseCase<CreateLeadMetadataFieldInput, LeadMetadataField, { input: CreateLeadMetadataFieldInput; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(input: CreateLeadMetadataFieldInput, actor?: ActivityActor): Promise<{ input: CreateLeadMetadataFieldInput; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<CreateLeadMetadataFieldInput>(createLeadMetadataFieldSchema, input);

    // organization_id is never taken from the payload: it is resolved
    // from the organization linked to the acting user.
    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await LeadMetadataFieldModelFactory();
    const existingRow = await LeadMetadataFieldModel.findOne({
      where: { organization_id: organizationId, name: validated.name.trim(), deleted_at: null },
    });
    if (existingRow) {
      throw new DuplicateEntityException("A lead metadata field with this name already exists.");
    }

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { input: CreateLeadMetadataFieldInput; actor: ActivityActor; organizationId: string | null }): Promise<LeadMetadataField> {
    const { input, organizationId } = context;
    await LeadMetadataFieldModelFactory();
    try {
      const row = await LeadMetadataFieldModel.create({
        uuid: randomUUID(),
        organization_id: organizationId ?? null,
        name: input.name?.trim(),
        description: input.description?.trim(),
        status: input.status ?? "active",
        deleted_at: null,
      });

      return LeadMetadataFieldModel.toApi(row.toJSON());
    } catch (error) {
      // Lost a concurrent insert race against the (organization_id, name)
      // unique index: report the same 409 as the pre-insert check.
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("A lead metadata field with this name already exists.");
      }
      throw error;
    }
  }

  protected async postExec(
    result: LeadMetadataField,
    context?: { input: CreateLeadMetadataFieldInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<LeadMetadataField> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "lead_metadata_field",
      entity_uuid: result.uuid,
      origin: null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
