import Joi from "joi";
import DeliveryOrderMetadataModelFactory, { DeliveryOrderMetadataModel, type DeliveryOrderMetadata, type UpdateDeliveryOrderMetadataInput } from "@/app/sales/models/DeliveryOrderMetadataModel";
import DocMetadataFieldModelFactory, { DocMetadataFieldModel } from "@/app/sales/models/DocMetadataFieldModel";
import { UniqueConstraintError } from "sequelize";
import { findDeliveryOrderInScope } from "@/app/sales/useCases/deliveryOrderMetadata/deliveryOrderMetadataScope";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";

const updateDeliveryOrderMetadataSchema = Joi.object({
  sales_doc_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  value: Joi.string().trim().min(1).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).unknown(false).min(1);

export class DeliveryOrderMetadataUpdateUseCase extends BaseUseCase<string, DeliveryOrderMetadata, { uuid: string; input: UpdateDeliveryOrderMetadataInput; actor: ActivityActor }> {

  private deliveryOrderMetadataData?: DeliveryOrderMetadataModel | null;
  private beforeData?: DeliveryOrderMetadata | null;

  protected async preExec(uuid: string, input: UpdateDeliveryOrderMetadataInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateDeliveryOrderMetadataInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateDeliveryOrderMetadataInput>(updateDeliveryOrderMetadataSchema, input);

    await DeliveryOrderMetadataModelFactory();
    this.deliveryOrderMetadataData = await DeliveryOrderMetadataModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.deliveryOrderMetadataData) {
      throw new NotFoundException("Delivery order metadata not found")
    }
    this.beforeData = DeliveryOrderMetadataModel.toApi(this.deliveryOrderMetadataData?.toJSON());

    const { organizationId } = await findDeliveryOrderInScope(
      this.deliveryOrderMetadataData.sales_delivery_order_id,
      actor ?? null,
    );

    if (validatedInput.sales_doc_metadata_field_id) {
      await DocMetadataFieldModelFactory();
      const field = await DocMetadataFieldModel.findOne({
        where: { uuid: validatedInput.sales_doc_metadata_field_id, organization_id: organizationId, deleted_at: null },
      });
      if (!field) {
        throw new NotFoundException("Doc metadata field not found.");
      }
    }

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateDeliveryOrderMetadataInput; actor: ActivityActor }): Promise<DeliveryOrderMetadata> {
    const { input } = context;
    const nextData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (input.sales_doc_metadata_field_id) {
      nextData.sales_doc_metadata_field_id = input.sales_doc_metadata_field_id;
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

    try {
      await this.deliveryOrderMetadataData?.update(nextData);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("Duplicate delivery order metadata row.");
      }
      throw error;
    }

    return DeliveryOrderMetadataModel.toApi(this.deliveryOrderMetadataData?.toJSON());
  }

  protected async postExec(
    result: DeliveryOrderMetadata,
    context?: { uuid: string; input: UpdateDeliveryOrderMetadataInput; actor: ActivityActor },
  ): Promise<DeliveryOrderMetadata> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "delivery_order_metadata",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
