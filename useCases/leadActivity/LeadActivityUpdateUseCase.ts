import Joi from "joi";
import LeadActivityModelFactory, { LeadActivityModel, type LeadActivity, type UpdateLeadActivityInput } from "@/app/sales/models/LeadActivityModel";
import LeadModelFactory, { LeadModel } from "@/app/sales/models/LeadModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";

const updateLeadActivitySchema = Joi.object({
  leads_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  pic: Joi.string().trim().min(2).max(120).optional(),
  phone: Joi.string().trim().min(6).max(30).optional(),
  email: Joi.string().trim().email().max(160).optional(),
  meeting_start: Joi.date().optional(),
  meeting_end: Joi.date().allow(null).optional(),
  notes: Joi.string().trim().min(2).optional(),
  attachment: Joi.string().trim().max(500).allow("", null).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).min(1);

export class LeadActivityUpdateUseCase extends BaseUseCase<string, LeadActivity, { uuid: string; input: UpdateLeadActivityInput; actor: ActivityActor }> {

  private leadActivityData?: LeadActivityModel | null;
  private beforeData?: LeadActivity | null;

  protected async preExec(uuid: string, input: UpdateLeadActivityInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateLeadActivityInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateLeadActivityInput>(updateLeadActivitySchema, input);

    await LeadActivityModelFactory();
    this.leadActivityData = await LeadActivityModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.leadActivityData) {
      throw new NotFoundException("Lead activity not found")
    }
    this.beforeData = LeadActivityModel.toApi(this.leadActivityData?.toJSON());

    if (validatedInput.leads_id) {
      await LeadModelFactory();
      const lead = await LeadModel.findOne({ where: { uuid: validatedInput.leads_id, deleted_at: null } });
      if (!lead) {
        throw new NotFoundException("Lead not found.");
      }
    }

    if (validatedInput.meeting_end && validatedInput.meeting_start) {
      if (new Date(validatedInput.meeting_end) <= new Date(validatedInput.meeting_start)) {
        throw new BadParameterException("meeting_end must be after meeting_start.");
      }
    }

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateLeadActivityInput; actor: ActivityActor }): Promise<LeadActivity> {
    const { input } = context;
    const nextData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (typeof input.leads_id === "string" && input.leads_id.trim()) {
      nextData.leads_id = input.leads_id;
    }

    if (typeof input.pic === "string" && input.pic.trim()) {
      nextData.pic = input.pic.trim();
    }

    if (typeof input.phone === "string" && input.phone.trim()) {
      nextData.phone = input.phone.trim();
    }

    if (typeof input.email === "string" && input.email.trim()) {
      nextData.email = input.email.trim().toLowerCase();
    }

    if (input.meeting_start) {
      nextData.meeting_start = new Date(input.meeting_start);
    }

    if (Object.prototype.hasOwnProperty.call(input, "meeting_end")) {
      nextData.meeting_end = input.meeting_end ? new Date(input.meeting_end) : null;
    }

    if (typeof input.notes === "string" && input.notes.trim()) {
      nextData.notes = input.notes.trim();
    }

    if (Object.prototype.hasOwnProperty.call(input, "attachment")) {
      nextData.attachment = input.attachment?.trim() || null;
    }

    if (input.status) {
      nextData.status = input.status;
      if (input.status === "deleted") {
        nextData.deleted_at = new Date();
      } else {
        nextData.deleted_at = null;
      }
    }

    await this.leadActivityData?.update(nextData);

    return LeadActivityModel.toApi(this.leadActivityData?.toJSON());
  }

  protected async postExec(
    result: LeadActivity,
    context?: { uuid: string; input: UpdateLeadActivityInput; actor: ActivityActor },
  ): Promise<LeadActivity> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "lead_activity",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
