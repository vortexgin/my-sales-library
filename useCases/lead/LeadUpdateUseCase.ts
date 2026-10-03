import Joi from "joi";
import { Op } from "sequelize";
import LeadModelFactory, { LeadModel, type Lead, type UpdateLeadInput } from "@/app/sales/models/LeadModel";
import UserModelFactory, { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";
import NotFoundException from "@/exceptions/NotFoundException";

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

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateLeadInput; actor: ActivityActor }): Promise<Lead> {
    const { input } = context;
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
