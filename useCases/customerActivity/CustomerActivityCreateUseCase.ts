import { randomUUID } from "crypto";
import Joi from "joi";
import CustomerActivityModelFactory, { CustomerActivityModel, type CreateCustomerActivityInput, type CustomerActivity } from "@/app/sales/models/CustomerActivityModel";
import CustomerModelFactory, { CustomerModel } from "@/app/sales/models/CustomerModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const createCustomerActivitySchema = Joi.object({
  customer_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  type: Joi.string().valid("call", "email", "meeting", "other").required(),
  subject: Joi.string().trim().min(2).max(200).required(),
  body: Joi.string().trim().min(2).required(),
  occurred_at: Joi.date().iso().required(),
  attachment_url: Joi.string().trim().max(500).allow("", null).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).unknown(false);

export class CustomerActivityCreateUseCase extends BaseUseCase<CreateCustomerActivityInput, CustomerActivity, { input: CreateCustomerActivityInput; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(input: CreateCustomerActivityInput, actor?: ActivityActor): Promise<{ input: CreateCustomerActivityInput; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<CreateCustomerActivityInput>(createCustomerActivitySchema, input);

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await CustomerModelFactory();
    const customer = await CustomerModel.findOne({ where: { uuid: validated.customer_id, deleted_at: null } });
    if (!customer || (organizationId && (customer.organization_id ?? null) !== organizationId)) {
      throw new NotFoundException("Customer not found.");
    }

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { input: CreateCustomerActivityInput; actor: ActivityActor; organizationId: string | null }): Promise<CustomerActivity> {
    const { input, organizationId } = context;
    await CustomerActivityModelFactory();
    const row = await CustomerActivityModel.create({
      uuid: randomUUID(),
      organization_id: organizationId ?? null,
      customer_id: input.customer_id,
      type: input.type,
      subject: input.subject?.trim(),
      body: input.body?.trim(),
      occurred_at: new Date(input.occurred_at),
      attachment_url: input.attachment_url?.trim() || null,
      status: input.status ?? "active",
      deleted_at: null,
    });

    return CustomerActivityModel.toApi(row.toJSON());
  }

  protected async postExec(
    result: CustomerActivity,
    context?: { input: CreateCustomerActivityInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<CustomerActivity> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "customer_activity",
      entity_uuid: result.uuid,
      origin: null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
