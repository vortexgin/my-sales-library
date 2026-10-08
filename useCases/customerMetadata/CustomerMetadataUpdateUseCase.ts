import Joi from "joi";
import CustomerMetadataModelFactory, { CustomerMetadataModel, type CustomerMetadata, type UpdateCustomerMetadataInput } from "@/app/sales/models/CustomerMetadataModel";
import CustomerMetadataFieldModelFactory, { CustomerMetadataFieldModel } from "@/app/sales/models/CustomerMetadataFieldModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const updateCustomerMetadataSchema = Joi.object({
  customer_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  value: Joi.string().trim().min(1).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).unknown(false).min(1);

export class CustomerMetadataUpdateUseCase extends BaseUseCase<string, CustomerMetadata, { uuid: string; input: UpdateCustomerMetadataInput; actor: ActivityActor }> {

  private customerMetadataData?: CustomerMetadataModel | null;
  private beforeData?: CustomerMetadata | null;

  protected async preExec(uuid: string, input: UpdateCustomerMetadataInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateCustomerMetadataInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateCustomerMetadataInput>(updateCustomerMetadataSchema, input);

    await CustomerMetadataModelFactory();
    this.customerMetadataData = await CustomerMetadataModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.customerMetadataData) {
      throw new NotFoundException("Customer metadata not found")
    }
    this.beforeData = CustomerMetadataModel.toApi(this.customerMetadataData?.toJSON());

    if (validatedInput.customer_metadata_field_id) {
      await CustomerMetadataFieldModelFactory();
      const field = await CustomerMetadataFieldModel.findOne({ where: { uuid: validatedInput.customer_metadata_field_id, deleted_at: null } });
      if (!field) {
        throw new NotFoundException("Customer metadata field not found.");
      }
    }

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateCustomerMetadataInput; actor: ActivityActor }): Promise<CustomerMetadata> {
    const { input } = context;
    const nextData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (input.customer_metadata_field_id) {
      nextData.customer_metadata_field_id = input.customer_metadata_field_id;
    }

    if (typeof input.value === "string" && input.value.trim()) {
      nextData.value = input.value.trim();
    }

    if (input.status) {
      nextData.status = input.status;
      if (input.status === "deleted") {
        nextData.deleted_at = new Date();
      } else {
        nextData.deleted_at = null;
      }
    }

    await this.customerMetadataData?.update(nextData);

    return CustomerMetadataModel.toApi(this.customerMetadataData?.toJSON());
  }

  protected async postExec(
    result: CustomerMetadata,
    context?: { uuid: string; input: UpdateCustomerMetadataInput; actor: ActivityActor },
  ): Promise<CustomerMetadata> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "customer_metadata",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
