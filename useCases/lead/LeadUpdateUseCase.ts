import Joi from "joi";
import { Op } from "sequelize";
import { randomUUID } from "crypto";
import LeadModelFactory, { LeadModel, type Lead, type UpdateLeadInput } from "@/app/sales/models/LeadModel";
import LeadMetadataModelFactory, { LeadMetadataModel } from "@/app/sales/models/LeadMetadataModel";
import LeadMetadataFieldModelFactory, { LeadMetadataFieldModel } from "@/app/sales/models/LeadMetadataFieldModel";
import UserModelFactory, { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";
import NotFoundException from "@/exceptions/NotFoundException";
import BadParameterException from "@/exceptions/BadParameterException";

const metadataNestedSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).optional(),
  lead_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  field_name: Joi.string().trim().min(2).max(160).optional(),
  value: Joi.string().trim().min(1).required(),
});

const updateLeadSchema = Joi.object({
  name: Joi.string().trim().min(2).optional(),
  email: Joi.string().trim().email().optional(),
  phone_number: Joi.string().trim().min(6).optional(),
  company: Joi.string().trim().allow("", null).max(160).optional(),
  source: Joi.string().valid("website", "referral", "ads", "cold_call", "event", "other").optional(),
  status: Joi.string().trim().min(2).max(60).optional(),
  value: Joi.number().integer().min(0).allow(null).optional(),
  assigned_to: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  notes: Joi.string().trim().allow("", null).optional(),
  metadata: Joi.array().items(metadataNestedSchema).optional(),
}).min(1);

export class LeadUpdateUseCase extends BaseUseCase<string, Lead, { uuid: string; input: UpdateLeadInput; actor: ActivityActor }> {

  private leadData?: LeadModel | null;
  private beforeData?: Lead | null;

  protected async preExec(uuid: string, input: UpdateLeadInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateLeadInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateLeadInput>(updateLeadSchema, input);

    await LeadModelFactory();
    this.leadData = await LeadModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.leadData) {
      throw new NotFoundException("Lead not found")
    }
    this.beforeData = LeadModel.toApi(this.leadData?.toJSON());

    if (validatedInput.email) {
      const emailTaken = await LeadModel.findOne({
        where: { email: validatedInput.email.trim().toLowerCase(), uuid: { [Op.ne]: uuid } },
      });
      if (emailTaken) {
        throw new DuplicateEntityException("A lead with this email already exists.");
      }
    }

    if (validatedInput.assigned_to) {
      await UserModelFactory();
      const assignee = await UserModel.findOne({ where: { uuid: validatedInput.assigned_to, deleted_at: null } });
      if (!assignee) {
        throw new NotFoundException("Assigned user not found.");
      }
    }

    const metadata = (validatedInput as UpdateLeadInput).metadata;
    if (metadata && metadata.length > 0) {
      await LeadMetadataFieldModelFactory();
      await LeadMetadataModelFactory();
      for (const item of metadata) {
        if (!item.lead_metadata_field_id && !item.field_name?.trim() && !item.uuid) {
          throw new BadParameterException("Each metadata needs a field or a new field name.");
        }
        if (item.uuid) {
          const existing = await LeadMetadataModel.findOne({
            where: { uuid: item.uuid, leads_id: uuid, deleted_at: null },
          });
          if (!existing) {
            throw new NotFoundException("Lead metadata not found.");
          }
        }
        if (item.lead_metadata_field_id) {
          const field = await LeadMetadataFieldModel.findOne({
            where: { uuid: item.lead_metadata_field_id, deleted_at: null },
          });
          if (!field) {
            throw new NotFoundException("Lead metadata field not found.");
          }
        }
      }
    }

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  private async resolveFieldId(
    fieldId: string | undefined,
    fieldName: string | undefined,
    organizationId: string | null,
    actor: ActivityActor,
  ): Promise<string | null> {
    const trimmedName = fieldName?.trim();
    if (fieldId) {
      return fieldId;
    }
    if (!trimmedName) {
      return null;
    }
    await LeadMetadataFieldModelFactory();
    const existingByName = await LeadMetadataFieldModel.findOne({
      where: { name: trimmedName, deleted_at: null },
    });
    if (existingByName) {
      return existingByName.uuid;
    }
    const created = await LeadMetadataFieldModel.create({
      uuid: randomUUID(),
      organization_id: organizationId,
      name: trimmedName,
      description: trimmedName,
      status: "active",
      deleted_at: null,
    });
    void recordActivityLog({
      actor: actor ?? null,
      operation: "create",
      entity: "lead_metadata_field",
      entity_uuid: created.uuid,
      origin: null,
      updated: { uuid: created.uuid, name: trimmedName } as any,
    });
    return created.uuid;
  }

  protected async execute(context: { uuid: string; input: UpdateLeadInput; actor: ActivityActor }): Promise<Lead> {
    const { uuid, input, actor } = context;
    const nextData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (typeof input.name === "string" && input.name.trim()) {
      nextData.name = input.name.trim();
    }

    if (typeof input.email === "string" && input.email.trim()) {
      nextData.email = input.email.trim().toLowerCase();
    }

    if (typeof input.phone_number === "string" && input.phone_number.trim()) {
      nextData.phone_number = input.phone_number.trim();
    }

    if (Object.prototype.hasOwnProperty.call(input, "company")) {
      nextData.company = input.company?.trim() || null;
    }

    if (input.source) {
      nextData.source = input.source;
    }

    if (typeof input.status === "string" && input.status.trim()) {
      nextData.status = input.status.trim();
    }

    if (Object.prototype.hasOwnProperty.call(input, "value")) {
      nextData.value = typeof input.value === "number" ? input.value : null;
    }

    if (Object.prototype.hasOwnProperty.call(input, "assigned_to")) {
      nextData.assigned_to = input.assigned_to ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(input, "notes")) {
      nextData.notes = input.notes?.trim() || null;
    }

    await this.leadData?.update(nextData);

    // Sync nested metadata when the key is present (full replacement semantics).
    if (Object.prototype.hasOwnProperty.call(input, "metadata")) {
      await LeadMetadataModelFactory();
      const organizationId = (this.leadData as any)?.organization_id ?? null;
      const existingRows = await LeadMetadataModel.findAll({
        where: { leads_id: uuid, deleted_at: null },
      });
      const existingByUuid = new Map(existingRows.map((row) => [row.uuid, row]));
      const seen = new Set<string>();
      const desired = input.metadata ?? [];

      for (const item of desired) {
        const fieldId = await this.resolveFieldId(
          item.lead_metadata_field_id,
          item.field_name,
          organizationId,
          actor,
        );
        if (item.uuid && existingByUuid.has(item.uuid)) {
          seen.add(item.uuid);
          const row = existingByUuid.get(item.uuid)!;
          const before = LeadMetadataModel.toApi(row.toJSON());
          const patch: Record<string, unknown> = { updated_at: new Date() };
          if (fieldId) {
            patch.lead_metadata_field_id = fieldId;
          }
          if (typeof item.value === "string" && item.value.trim()) {
            patch.value = item.value.trim();
          }
          await row.update(patch);
          const after = LeadMetadataModel.toApi(row.toJSON());
          void recordActivityLog({
            actor: actor ?? null,
            operation: "update",
            entity: "lead_metadata",
            entity_uuid: row.uuid,
            origin: before as any,
            updated: after as any,
          });
        } else {
          if (!fieldId) {
            continue;
          }
          const created = await LeadMetadataModel.create({
            uuid: randomUUID(),
            leads_id: uuid,
            lead_metadata_field_id: fieldId,
            value: item.value?.trim(),
            status: "active",
            deleted_at: null,
          });
          seen.add(created.uuid);
          void recordActivityLog({
            actor: actor ?? null,
            operation: "create",
            entity: "lead_metadata",
            entity_uuid: created.uuid,
            origin: null,
            updated: LeadMetadataModel.toApi(created.toJSON()) as any,
          });
        }
      }

      for (const row of existingRows) {
        if (!seen.has(row.uuid)) {
          const before = LeadMetadataModel.toApi(row.toJSON());
          await row.update({ status: "deleted", deleted_at: new Date(), updated_at: new Date() });
          void recordActivityLog({
            actor: actor ?? null,
            operation: "delete",
            entity: "lead_metadata",
            entity_uuid: row.uuid,
            origin: before as any,
            updated: null,
          });
        }
      }
    }

    return LeadModel.toApi(this.leadData?.toJSON());
  }

  protected async postExec(
    result: Lead,
    context?: { uuid: string; input: UpdateLeadInput; actor: ActivityActor },
  ): Promise<Lead> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "lead",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
