import { randomUUID } from "crypto";
import Joi, { Schema } from "joi";
import LeadModelFactory, { LeadModel, type CreateLeadInput, type Lead } from "@/app/sales/models/LeadModel";
import { insertLeadRow } from "@/app/sales/libraries/insertLeadRow";
import LeadMetadataModelFactory, { LeadMetadataModel } from "@/app/sales/models/LeadMetadataModel";
import LeadMetadataFieldModelFactory, { LeadMetadataFieldModel } from "@/app/sales/models/LeadMetadataFieldModel";
import LeadStatusModelFactory, { LeadStatusModel } from "@/app/sales/models/LeadStatusModel";
import UserModelFactory, { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import { checkTransaction, settleTransaction, type TransactionBilling } from "@/useCases/TransactionUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";
import NotFoundException from "@/exceptions/NotFoundException";
import BadParameterException from "@/exceptions/BadParameterException";

const metadataNestedSchema = Joi.object({
  lead_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  field_name: Joi.string().trim().min(2).max(160).optional(),
  value: Joi.string().trim().min(1).required(),
});

const createLeadSchema = Joi.object({
  name: Joi.string().trim().min(2).required(),
  email: Joi.string().trim().email().required(),
  phone_number: Joi.string().trim().min(6).required(),
  company: Joi.string().trim().allow("", null).max(160).optional(),
  source: Joi.string().valid("website", "referral", "ads", "cold_call", "event", "other").optional(),
  status: Joi.string().trim().min(2).max(60).optional(),
  value: Joi.number().integer().min(0).allow(null).optional(),
  assigned_to: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  notes: Joi.string().trim().allow("", null).optional(),
  metadata: Joi.array().items(metadataNestedSchema).optional(),
});

export type LeadCreateContext = { input: CreateLeadInput; actor: ActivityActor; organizationId: string | null } & TransactionBilling;

export class LeadCreateUseCase extends BaseUseCase<CreateLeadInput, Lead, LeadCreateContext> {
  protected async preExec(input: CreateLeadInput, actor?: ActivityActor): Promise<LeadCreateContext> {
    const billing = await checkTransaction(actor, "sales:lead:create:create");

    const validated = await this.validate<CreateLeadInput>(createLeadSchema, input);

    // organization_id is never taken from the payload: it is resolved
    // from the organization linked to the acting user.
    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    // No status given: start at the lowest-weight active stage for the org.
    if (!validated.status?.trim()) {
      await LeadStatusModelFactory();
      validated.status = await LeadStatusModel.resolveStartName(organizationId);
    }

    return { input: validated, actor: actor ?? null, organizationId, ...billing };
  }

  protected async validate<TValidated = CreateLeadInput>(schema: Schema, input: CreateLeadInput): Promise<TValidated> {
    const validatedInput = await super.validate<TValidated>(schema, input);

    await LeadModelFactory();
    const existingLead = await LeadModel.findOne({ where: { email: input.email } });
    if (existingLead) {
      throw new DuplicateEntityException("A lead with this email already exists.");
    }

    if (input.assigned_to) {
      await UserModelFactory();
      const assignee = await UserModel.findOne({ where: { uuid: input.assigned_to, deleted_at: null } });
      if (!assignee) {
        throw new NotFoundException("Assigned user not found.");
      }
    }

    const metadata = (input as CreateLeadInput).metadata;
    if (metadata && metadata.length > 0) {
      await LeadMetadataFieldModelFactory();
      for (const item of metadata) {
        if (!item.lead_metadata_field_id && !item.field_name?.trim()) {
          throw new BadParameterException("Each metadata needs a field or a new field name.");
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

    return validatedInput;
  }

  protected async execute(context: LeadCreateContext): Promise<Lead> {
    const { input, organizationId, actor } = context;
    const api = await insertLeadRow(input, organizationId);

    // Nested metadata insert (also supports on-the-fly field creation).
    const metadata = input.metadata;
    if (metadata && metadata.length > 0) {
      await LeadMetadataModelFactory();
      await LeadMetadataFieldModelFactory();
      for (const item of metadata) {
        let fieldId = item.lead_metadata_field_id;
        const newName = item.field_name?.trim();
        if (!fieldId && newName) {
          const existingByName = await LeadMetadataFieldModel.findOne({
            where: { name: newName, deleted_at: null },
          });
          if (existingByName) {
            fieldId = existingByName.uuid;
          } else {
            const created = await LeadMetadataFieldModel.create({
              uuid: randomUUID(),
              organization_id: organizationId ?? null,
              name: newName,
              description: newName,
              status: "active",
              deleted_at: null,
            });
            fieldId = created.uuid;
            void recordActivityLog({
              actor: actor ?? null,
              operation: "create",
              entity: "lead_metadata_field",
              entity_uuid: fieldId,
              origin: null,
              updated: { uuid: fieldId, name: newName } as any,
            });
          }
        }
        if (!fieldId) {
          continue;
        }
        const row = await LeadMetadataModel.create({
          uuid: randomUUID(),
          leads_id: api.uuid,
          lead_metadata_field_id: fieldId,
          value: item.value?.trim(),
          status: "active",
          deleted_at: null,
        });
        void recordActivityLog({
          actor: actor ?? null,
          operation: "create",
          entity: "lead_metadata",
          entity_uuid: row.uuid,
          origin: null,
          updated: LeadMetadataModel.toApi(row.toJSON()) as any,
        });
      }
    }

    return api;
  }

  protected async postExec(result: Lead, context?: LeadCreateContext): Promise<Lead> {
    await settleTransaction({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "lead",
      entity_uuid: result.uuid,
      origin: null,
      updated: result,
      billing: context ?? null,
    });
    return super.postExec(result, context);
  }
}
