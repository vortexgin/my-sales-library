import { randomUUID } from "crypto";
import Joi from "joi";
import LeadStatusModelFactory, { LeadStatusModel, type CreateLeadStatusInput, type LeadStatus } from "@/app/sales/models/LeadStatusModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

const createLeadStatusSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  description: Joi.string().trim().min(2).required(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
});

export class LeadStatusCreateUseCase extends BaseUseCase<CreateLeadStatusInput, LeadStatus, { input: CreateLeadStatusInput; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(input: CreateLeadStatusInput, actor?: ActivityActor): Promise<{ input: CreateLeadStatusInput; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<CreateLeadStatusInput>(createLeadStatusSchema, input);

    // organization_id is never taken from the payload: it is resolved
    // from the organization linked to the acting user.
    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { input: CreateLeadStatusInput; actor: ActivityActor; organizationId: string | null }): Promise<LeadStatus> {
    const { input, organizationId } = context;
    await LeadStatusModelFactory();
    const row = await LeadStatusModel.create({
      uuid: randomUUID(),
      organization_id: organizationId ?? null,
      name: input.name?.trim(),
      description: input.description?.trim(),
      status: input.status ?? "active",
      deleted_at: null,
    });

    return LeadStatusModel.toApi(row.toJSON());
  }

  protected async postExec(
    result: LeadStatus,
    context?: { input: CreateLeadStatusInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<LeadStatus> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "lead_status",
      entity_uuid: result.uuid,
      origin: null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
