import Joi from "joi";
import { UniqueConstraintError } from "sequelize";
import PurchaseRequestMetadataModelFactory, { PurchaseRequestMetadataModel, type PurchaseRequestMetadata, type UpdatePurchaseRequestMetadataInput } from "@/app/sales/models/PurchaseRequestMetadataModel";
import DocMetadataFieldModelFactory, { DocMetadataFieldModel } from "@/app/sales/models/DocMetadataFieldModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";
import { findScopedParent } from "@/app/sales/useCases/purchaseRequestMetadata/parentScope";

const updatePurchaseRequestMetadataSchema = Joi.object({
  sales_doc_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  value: Joi.string().trim().min(1).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).unknown(false).min(1);

export class PurchaseRequestMetadataUpdateUseCase extends BaseUseCase<string, PurchaseRequestMetadata, { uuid: string; input: UpdatePurchaseRequestMetadataInput; actor: ActivityActor }> {

  private purchaseRequestMetadataData?: PurchaseRequestMetadataModel | null;
  private beforeData?: PurchaseRequestMetadata | null;

  protected async preExec(uuid: string, input: UpdatePurchaseRequestMetadataInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdatePurchaseRequestMetadataInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdatePurchaseRequestMetadataInput>(updatePurchaseRequestMetadataSchema, input);

    await PurchaseRequestMetadataModelFactory();
    this.purchaseRequestMetadataData = await PurchaseRequestMetadataModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.purchaseRequestMetadataData) {
      throw new NotFoundException("Purchase request metadata not found")
    }
    this.beforeData = PurchaseRequestMetadataModel.toApi(this.purchaseRequestMetadataData?.toJSON());

    const { organizationId } = await findScopedParent(this.purchaseRequestMetadataData.purchase_request_id, actor ?? null);

    if (validatedInput.sales_doc_metadata_field_id) {
      await DocMetadataFieldModelFactory();
      const field = await DocMetadataFieldModel.findOne({
        where: {
          uuid: validatedInput.sales_doc_metadata_field_id,
          organization_id: organizationId,
          deleted_at: null,
        },
      });
      if (!field) {
        throw new NotFoundException("Document metadata field not found.");
      }
    }

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdatePurchaseRequestMetadataInput; actor: ActivityActor }): Promise<PurchaseRequestMetadata> {
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
      await this.purchaseRequestMetadataData?.update(nextData);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("Duplicate purchase request metadata row.");
      }
      throw error;
    }

    return PurchaseRequestMetadataModel.toApi(this.purchaseRequestMetadataData?.toJSON());
  }

  protected async postExec(
    result: PurchaseRequestMetadata,
    context?: { uuid: string; input: UpdatePurchaseRequestMetadataInput; actor: ActivityActor },
  ): Promise<PurchaseRequestMetadata> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "purchase_request_metadata",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
