import { randomUUID } from "crypto";
import Joi from "joi";
import { UniqueConstraintError } from "sequelize";
import CustomerMetadataFieldModelFactory, { CustomerMetadataFieldModel, type CreateCustomerMetadataFieldInput, type CustomerMetadataField } from "@/app/sales/models/CustomerMetadataFieldModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";

const createCustomerMetadataFieldSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  description: Joi.string().trim().min(2).required(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
});

export class CustomerMetadataFieldCreateUseCase extends BaseUseCase<CreateCustomerMetadataFieldInput, CustomerMetadataField, { input: CreateCustomerMetadataFieldInput; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(input: CreateCustomerMetadataFieldInput, actor?: ActivityActor): Promise<{ input: CreateCustomerMetadataFieldInput; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<CreateCustomerMetadataFieldInput>(createCustomerMetadataFieldSchema, input);

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await CustomerMetadataFieldModelFactory();
    const existingRow = await CustomerMetadataFieldModel.findOne({
      where: { organization_id: organizationId, name: validated.name.trim(), deleted_at: null },
    });
    if (existingRow) {
      throw new DuplicateEntityException("A customer metadata field with this name already exists.");
    }

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { input: CreateCustomerMetadataFieldInput; actor: ActivityActor; organizationId: string | null }): Promise<CustomerMetadataField> {
    const { input, organizationId } = context;
    await CustomerMetadataFieldModelFactory();
    try {
      const row = await CustomerMetadataFieldModel.create({
        uuid: randomUUID(),
        organization_id: organizationId ?? null,
        name: input.name?.trim(),
        description: input.description?.trim(),
        status: input.status ?? "active",
        deleted_at: null,
      });

      return CustomerMetadataFieldModel.toApi(row.toJSON());
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("A customer metadata field with this name already exists.");
      }
      throw error;
    }
  }

  protected async postExec(
    result: CustomerMetadataField,
    context?: { input: CreateCustomerMetadataFieldInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<CustomerMetadataField> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "customer_metadata_field",
      entity_uuid: result.uuid,
      origin: null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
