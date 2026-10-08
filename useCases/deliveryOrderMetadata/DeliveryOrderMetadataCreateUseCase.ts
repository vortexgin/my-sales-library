import { randomUUID } from "crypto";
import Joi from "joi";
import DeliveryOrderMetadataModelFactory, { DeliveryOrderMetadataModel, type CreateDeliveryOrderMetadataInput, type DeliveryOrderMetadata } from "@/app/sales/models/DeliveryOrderMetadataModel";
import DocMetadataFieldModelFactory, { DocMetadataFieldModel } from "@/app/sales/models/DocMetadataFieldModel";
import { UniqueConstraintError } from "sequelize";
import { findDeliveryOrderInScope } from "@/app/sales/useCases/deliveryOrderMetadata/deliveryOrderMetadataScope";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";

const createDeliveryOrderMetadataSchema = Joi.object({
  sales_delivery_order_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  sales_doc_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  value: Joi.string().trim().min(1).required(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).unknown(false);

export class DeliveryOrderMetadataCreateUseCase extends BaseUseCase<CreateDeliveryOrderMetadataInput, DeliveryOrderMetadata, { input: CreateDeliveryOrderMetadataInput; actor: ActivityActor }> {
  protected async preExec(input: CreateDeliveryOrderMetadataInput, actor?: ActivityActor): Promise<{ input: CreateDeliveryOrderMetadataInput; actor: ActivityActor }> {
    const validated = await this.validate<CreateDeliveryOrderMetadataInput>(createDeliveryOrderMetadataSchema, input);

    const { organizationId } = await findDeliveryOrderInScope(validated.sales_delivery_order_id, actor ?? null);

    await DocMetadataFieldModelFactory();
    const field = await DocMetadataFieldModel.findOne({
      where: { uuid: validated.sales_doc_metadata_field_id, organization_id: organizationId, deleted_at: null },
    });
    if (!field) {
      throw new NotFoundException("Doc metadata field not found.");
    }

    return { input: validated, actor: actor ?? null };
  }

  protected async execute(context: { input: CreateDeliveryOrderMetadataInput; actor: ActivityActor }): Promise<DeliveryOrderMetadata> {
    const { input } = context;
    await DeliveryOrderMetadataModelFactory();
    let row;
    try {
      row = await DeliveryOrderMetadataModel.create({
        uuid: randomUUID(),
        sales_delivery_order_id: input.sales_delivery_order_id,
        sales_doc_metadata_field_id: input.sales_doc_metadata_field_id,
        value: input.value?.trim(),
        status: input.status ?? "active",
        deleted_at: null,
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("Duplicate delivery order metadata row.");
      }
      throw error;
    }

    return DeliveryOrderMetadataModel.toApi(row.toJSON());
  }

  protected async postExec(
    result: DeliveryOrderMetadata,
    context?: { input: CreateDeliveryOrderMetadataInput; actor: ActivityActor },
  ): Promise<DeliveryOrderMetadata> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "delivery_order_metadata",
      entity_uuid: result.uuid,
      origin: null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
