import Joi from "joi";
import { Op, UniqueConstraintError } from "sequelize";
import CustomerModelFactory, { CustomerModel, type Customer, type UpdateCustomerInput } from "@/app/sales/models/CustomerModel";
import { syncCustomerMetadata, type CustomerMetadataNestedItem } from "@/app/sales/useCases/customer/customerMetadataSync";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";
import NotFoundException from "@/exceptions/NotFoundException";

const customerMetadataNestedSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).optional(),
  customer_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  field_name: Joi.string().trim().min(2).max(160).optional(),
  value: Joi.string().trim().min(1).required(),
});

const updateCustomerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).optional(),
  email: Joi.string().trim().email().max(160).optional(),
  phone: Joi.string().trim().min(6).max(30).optional(),
  company_name: Joi.string().trim().allow("", null).max(160).optional(),
  notes: Joi.string().trim().allow("", null).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
  metadata: Joi.array().items(customerMetadataNestedSchema).optional(),
}).unknown(false).min(1);

export class CustomerUpdateUseCase extends BaseUseCase<string, Customer, { uuid: string; input: UpdateCustomerInput; actor: ActivityActor }> {

  private customerData?: CustomerModel | null;
  private beforeData?: Customer | null;

  protected async preExec(uuid: string, input: UpdateCustomerInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateCustomerInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateCustomerInput>(updateCustomerSchema, input);

    await CustomerModelFactory();
    this.customerData = await CustomerModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.customerData) {
      throw new NotFoundException("Customer not found")
    }
    this.beforeData = CustomerModel.toApi(this.customerData?.toJSON());

    if (validatedInput.email) {
      const emailTaken = await CustomerModel.findOne({
        where: {
          email: validatedInput.email.trim().toLowerCase(),
          organization_id: this.beforeData?.organization_id ?? null,
          uuid: { [Op.ne]: uuid },
          deleted_at: null,
        },
      });
      if (emailTaken) {
        throw new DuplicateEntityException("A customer with this email already exists.");
      }
    }

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateCustomerInput; actor: ActivityActor }): Promise<Customer> {
    const { uuid, input, actor } = context;
    const nextData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (typeof input.name === "string" && input.name.trim()) {
      nextData.name = input.name.trim();
    }

    if (typeof input.email === "string" && input.email.trim()) {
      nextData.email = input.email.trim().toLowerCase();
    }

    if (typeof input.phone === "string" && input.phone.trim()) {
      nextData.phone = input.phone.trim();
    }

    if (Object.prototype.hasOwnProperty.call(input, "company_name")) {
      nextData.company_name = input.company_name?.trim() || null;
    }

    if (Object.prototype.hasOwnProperty.call(input, "notes")) {
      nextData.notes = input.notes?.trim() || null;
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
      await this.customerData?.update(nextData);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("A customer with this email already exists.");
      }
      throw error;
    }

    if (Object.prototype.hasOwnProperty.call(input, "metadata")) {
      const api = CustomerModel.toApi(this.customerData?.toJSON());
      await syncCustomerMetadata(
        uuid,
        input.metadata as CustomerMetadataNestedItem[] | undefined,
        api.organization_id,
        actor,
      );
    }

    return CustomerModel.toApi(this.customerData?.toJSON());
  }

  protected async postExec(
    result: Customer,
    context?: { uuid: string; input: UpdateCustomerInput; actor: ActivityActor },
  ): Promise<Customer> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "customer",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
