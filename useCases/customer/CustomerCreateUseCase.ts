import { randomUUID } from "crypto";
import Joi from "joi";
import { UniqueConstraintError } from "sequelize";
import CustomerModelFactory, { CustomerModel, type CreateCustomerInput, type Customer } from "@/app/sales/models/CustomerModel";
import { syncCustomerMetadata, type CustomerMetadataNestedItem } from "@/app/sales/useCases/customer/customerMetadataSync";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";

const customerMetadataNestedSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).optional(),
  customer_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  field_name: Joi.string().trim().min(2).max(160).optional(),
  value: Joi.string().trim().min(1).required(),
});

const createCustomerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  email: Joi.string().trim().email().max(160).required(),
  phone: Joi.string().trim().min(6).max(30).required(),
  company_name: Joi.string().trim().allow("", null).max(160).optional(),
  notes: Joi.string().trim().allow("", null).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
  metadata: Joi.array().items(customerMetadataNestedSchema).optional(),
}).unknown(false);

export type CustomerCreateContext = { input: CreateCustomerInput; actor: ActivityActor; organizationId: string | null };

export class CustomerCreateUseCase extends BaseUseCase<CreateCustomerInput, Customer, CustomerCreateContext> {
  protected async preExec(input: CreateCustomerInput, actor?: ActivityActor): Promise<CustomerCreateContext> {
    const validated = await this.validate<CreateCustomerInput>(createCustomerSchema, input);

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await CustomerModelFactory();
    const existingCustomer = await CustomerModel.findOne({
      where: { email: validated.email.trim().toLowerCase(), organization_id: organizationId, deleted_at: null },
    });
    if (existingCustomer) {
      throw new DuplicateEntityException("A customer with this email already exists.");
    }

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: CustomerCreateContext): Promise<Customer> {
    const { input, organizationId, actor } = context;
    await CustomerModelFactory();
    try {
      const row = await CustomerModel.create({
        uuid: randomUUID(),
        organization_id: organizationId ?? null,
        lead_id: null,
        name: input.name?.trim(),
        email: input.email?.trim().toLowerCase(),
        phone: input.phone?.trim(),
        company_name: input.company_name?.trim() || null,
        notes: input.notes?.trim() || null,
        status: input.status ?? "active",
        deleted_at: null,
      });

      const api = CustomerModel.toApi(row.toJSON());
      await syncCustomerMetadata(
        api.uuid,
        input.metadata as CustomerMetadataNestedItem[] | undefined,
        organizationId,
        actor,
      );
      return api;
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("A customer with this email already exists.");
      }
      throw error;
    }
  }

  protected async postExec(result: Customer, context?: CustomerCreateContext): Promise<Customer> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "customer",
      entity_uuid: result.uuid,
      origin: null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
