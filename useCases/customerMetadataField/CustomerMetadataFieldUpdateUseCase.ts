import Joi from "joi";
import { Op, UniqueConstraintError } from "sequelize";
import CustomerMetadataFieldModelFactory, { CustomerMetadataFieldModel, type CustomerMetadataField, type UpdateCustomerMetadataFieldInput } from "@/app/sales/models/CustomerMetadataFieldModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";
import NotFoundException from "@/exceptions/NotFoundException";

const updateCustomerMetadataFieldSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).optional(),
  description: Joi.string().trim().min(2).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).min(1);

export class CustomerMetadataFieldUpdateUseCase extends BaseUseCase<string, CustomerMetadataField, { uuid: string; input: UpdateCustomerMetadataFieldInput; actor: ActivityActor }> {

  private customerMetadataFieldData?: CustomerMetadataFieldModel | null;
  private beforeData?: CustomerMetadataField | null;

  protected async preExec(uuid: string, input: UpdateCustomerMetadataFieldInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateCustomerMetadataFieldInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateCustomerMetadataFieldInput>(updateCustomerMetadataFieldSchema, input);

    await CustomerMetadataFieldModelFactory();
    this.customerMetadataFieldData = await CustomerMetadataFieldModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.customerMetadataFieldData) {
      throw new NotFoundException("Customer metadata field not found")
    }
    this.beforeData = CustomerMetadataFieldModel.toApi(this.customerMetadataFieldData?.toJSON());

    if (validatedInput.name?.trim()) {
      const nameTaken = await CustomerMetadataFieldModel.findOne({
        where: {
          organization_id: this.beforeData?.organization_id ?? null,
          name: validatedInput.name.trim(),
          uuid: { [Op.ne]: uuid },
          deleted_at: null,
        },
      });
      if (nameTaken) {
        throw new DuplicateEntityException("A customer metadata field with this name already exists.");
      }
    }

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateCustomerMetadataFieldInput; actor: ActivityActor }): Promise<CustomerMetadataField> {
    const { input } = context;
    const nextData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (typeof input.name === "string" && input.name.trim()) {
      nextData.name = input.name.trim();
    }

    if (typeof input.description === "string" && input.description.trim()) {
      nextData.description = input.description.trim();
    }

    if (input.status) {
      nextData.status = input.status;
      if (input.status === "deleted") {
        nextData.deleted_at = new Date();
      } else {
        nextData.deleted_at = null;
      }
    }

    try {
      await this.customerMetadataFieldData?.update(nextData);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("A customer metadata field with this name already exists.");
      }
      throw error;
    }

    return CustomerMetadataFieldModel.toApi(this.customerMetadataFieldData?.toJSON());
  }

  protected async postExec(
    result: CustomerMetadataField,
    context?: { uuid: string; input: UpdateCustomerMetadataFieldInput; actor: ActivityActor },
  ): Promise<CustomerMetadataField> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "customer_metadata_field",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
