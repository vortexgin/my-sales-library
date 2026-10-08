import { randomUUID } from "crypto";
import Joi from "joi";
import CustomerMetadataModelFactory, { CustomerMetadataModel, type CreateCustomerMetadataInput, type CustomerMetadata } from "@/app/sales/models/CustomerMetadataModel";
import CustomerModelFactory, { CustomerModel } from "@/app/sales/models/CustomerModel";
import CustomerMetadataFieldModelFactory, { CustomerMetadataFieldModel } from "@/app/sales/models/CustomerMetadataFieldModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const createCustomerMetadataSchema = Joi.object({
  customer_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  customer_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  value: Joi.string().trim().min(1).required(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).unknown(false);

export class CustomerMetadataCreateUseCase extends BaseUseCase<CreateCustomerMetadataInput, CustomerMetadata, { input: CreateCustomerMetadataInput; actor: ActivityActor }> {
  protected async preExec(input: CreateCustomerMetadataInput, actor?: ActivityActor): Promise<{ input: CreateCustomerMetadataInput; actor: ActivityActor }> {
    const validated = await this.validate<CreateCustomerMetadataInput>(createCustomerMetadataSchema, input);

    await CustomerModelFactory();
    const customer = await CustomerModel.findOne({ where: { uuid: validated.customer_id, deleted_at: null } });
    if (!customer) {
      throw new NotFoundException("Customer not found.");
    }

    await CustomerMetadataFieldModelFactory();
    const field = await CustomerMetadataFieldModel.findOne({ where: { uuid: validated.customer_metadata_field_id, deleted_at: null } });
    if (!field) {
      throw new NotFoundException("Customer metadata field not found.");
    }

    return { input: validated, actor: actor ?? null };
  }

  protected async execute(context: { input: CreateCustomerMetadataInput; actor: ActivityActor }): Promise<CustomerMetadata> {
    const { input } = context;
    await CustomerMetadataModelFactory();
    const row = await CustomerMetadataModel.create({
      uuid: randomUUID(),
      customer_id: input.customer_id,
      customer_metadata_field_id: input.customer_metadata_field_id,
      value: input.value?.trim(),
      status: input.status ?? "active",
      deleted_at: null,
    });

    return CustomerMetadataModel.toApi(row.toJSON());
  }

  protected async postExec(
    result: CustomerMetadata,
    context?: { input: CreateCustomerMetadataInput; actor: ActivityActor },
  ): Promise<CustomerMetadata> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "customer_metadata",
      entity_uuid: result.uuid,
      origin: null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
