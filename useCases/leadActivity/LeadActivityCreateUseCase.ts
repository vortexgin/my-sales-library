import { randomUUID } from "crypto";
import Joi from "joi";
import LeadActivityModelFactory, { LeadActivityModel, type CreateLeadActivityInput, type LeadActivity } from "@/app/sales/models/LeadActivityModel";
import LeadModelFactory, { LeadModel } from "@/app/sales/models/LeadModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const createLeadActivitySchema = Joi.object({
  leads_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  pic: Joi.string().trim().min(2).max(120).required(),
  phone: Joi.string().trim().min(6).max(30).required(),
  email: Joi.string().trim().email().max(160).required(),
  meeting_start: Joi.date().required(),
  meeting_end: Joi.date().greater(Joi.ref("meeting_start")).allow(null).optional(),
  notes: Joi.string().trim().min(2).required(),
  attachment: Joi.string().trim().max(500).allow("", null).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
});

export class LeadActivityCreateUseCase extends BaseUseCase<CreateLeadActivityInput, LeadActivity, { input: CreateLeadActivityInput; actor: ActivityActor }> {
  protected async preExec(input: CreateLeadActivityInput, actor?: ActivityActor): Promise<{ input: CreateLeadActivityInput; actor: ActivityActor }> {
    const validated = await this.validate<CreateLeadActivityInput>(createLeadActivitySchema, input);

    await LeadModelFactory();
    const lead = await LeadModel.findOne({ where: { uuid: validated.leads_id, deleted_at: null } });
    if (!lead) {
      throw new NotFoundException("Lead not found.");
    }

    return { input: validated, actor: actor ?? null };
  }

  protected async execute(context: { input: CreateLeadActivityInput; actor: ActivityActor }): Promise<LeadActivity> {
    const { input } = context;
    await LeadActivityModelFactory();
    const row = await LeadActivityModel.create({
      uuid: randomUUID(),
      leads_id: input.leads_id,
      pic: input.pic?.trim(),
      phone: input.phone?.trim(),
      email: input.email?.trim().toLowerCase(),
      meeting_start: new Date(input.meeting_start),
      meeting_end: input.meeting_end ? new Date(input.meeting_end) : null,
      notes: input.notes?.trim(),
      attachment: input.attachment?.trim() || null,
      status: input.status ?? "active",
      deleted_at: null,
    });

    return LeadActivityModel.toApi(row.toJSON());
  }

  protected async postExec(
    result: LeadActivity,
    context?: { input: CreateLeadActivityInput; actor: ActivityActor },
  ): Promise<LeadActivity> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "lead_activity",
      entity_uuid: result.uuid,
      origin: null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
