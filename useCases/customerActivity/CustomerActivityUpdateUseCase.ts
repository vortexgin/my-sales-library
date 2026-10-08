import Joi from "joi";
import CustomerActivityModelFactory, { CustomerActivityModel, type CustomerActivity, type UpdateCustomerActivityInput } from "@/app/sales/models/CustomerActivityModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const updateCustomerActivitySchema = Joi.object({
  type: Joi.string().valid("call", "email", "meeting", "other").optional(),
  subject: Joi.string().trim().min(2).max(200).optional(),
  body: Joi.string().trim().min(2).optional(),
  occurred_at: Joi.date().iso().optional(),
  attachment_url: Joi.string().trim().max(500).allow("", null).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).unknown(false).min(1);

export class CustomerActivityUpdateUseCase extends BaseUseCase<string, CustomerActivity, { uuid: string; input: UpdateCustomerActivityInput; actor: ActivityActor }> {

  private customerActivityData?: CustomerActivityModel | null;
  private beforeData?: CustomerActivity | null;

  protected async preExec(uuid: string, input: UpdateCustomerActivityInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateCustomerActivityInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateCustomerActivityInput>(updateCustomerActivitySchema, input);

    await CustomerActivityModelFactory();
    this.customerActivityData = await CustomerActivityModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.customerActivityData) {
      throw new NotFoundException("Customer activity not found")
    }
    this.beforeData = CustomerActivityModel.toApi(this.customerActivityData?.toJSON());

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateCustomerActivityInput; actor: ActivityActor }): Promise<CustomerActivity> {
    const { input } = context;
    const nextData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (input.type) {
      nextData.type = input.type;
    }

    if (typeof input.subject === "string" && input.subject.trim()) {
      nextData.subject = input.subject.trim();
    }

    if (typeof input.body === "string" && input.body.trim()) {
      nextData.body = input.body.trim();
    }

    if (input.occurred_at) {
      nextData.occurred_at = new Date(input.occurred_at);
    }

    if (Object.prototype.hasOwnProperty.call(input, "attachment_url")) {
      nextData.attachment_url = input.attachment_url?.trim() || null;
    }

    if (input.status) {
      nextData.status = input.status;
      if (input.status === "deleted") {
        nextData.deleted_at = new Date();
      } else {
        nextData.deleted_at = null;
      }
    }

    await this.customerActivityData?.update(nextData);

    return CustomerActivityModel.toApi(this.customerActivityData?.toJSON());
  }

  protected async postExec(
    result: CustomerActivity,
    context?: { uuid: string; input: UpdateCustomerActivityInput; actor: ActivityActor },
  ): Promise<CustomerActivity> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "customer_activity",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
