import { randomUUID } from "crypto";
import Joi, { Schema } from "joi";
import LeadModelFactory, { LeadModel, type CreateLeadInput, type Lead } from "@/app/sales/models/LeadModel";
import UserModelFactory, { UserModel } from "@/app/base/models/UserModel";
import type { ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import { checkTransaction, settleTransaction, type TransactionBilling } from "@/useCases/TransactionUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";
import NotFoundException from "@/exceptions/NotFoundException";

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

    return validatedInput;
  }

  protected async execute(context: LeadCreateContext): Promise<Lead> {
    const { input, organizationId } = context;
    await LeadModelFactory();
    const lead = await LeadModel.create({
      uuid: randomUUID(),
      name: input.name?.trim(),
      email: input.email?.trim().toLowerCase(),
      phone_number: input.phone_number?.trim(),
      company: input.company?.trim() || null,
      source: input.source ?? "website",
      status: input.status ?? "new",
      value: typeof input.value === "number" ? input.value : null,
      assigned_to: input.assigned_to ?? null,
      organization_id: organizationId ?? null,
      notes: input.notes?.trim() || null,
      deleted_at: null,
    });

    return LeadModel.toApi(lead.toJSON());
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
