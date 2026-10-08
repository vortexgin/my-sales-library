import { randomUUID } from "crypto";
import Joi from "joi";
import { UniqueConstraintError } from "sequelize";
import PurchaseRequestMetadataModelFactory, { PurchaseRequestMetadataModel, type CreatePurchaseRequestMetadataInput, type PurchaseRequestMetadata } from "@/app/sales/models/PurchaseRequestMetadataModel";
import DocMetadataFieldModelFactory, { DocMetadataFieldModel } from "@/app/sales/models/DocMetadataFieldModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";
import { findScopedParent } from "@/app/sales/useCases/purchaseRequestMetadata/parentScope";

const createPurchaseRequestMetadataSchema = Joi.object({
  purchase_request_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  sales_doc_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  value: Joi.string().trim().min(1).required(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).unknown(false);

export class PurchaseRequestMetadataCreateUseCase extends BaseUseCase<CreatePurchaseRequestMetadataInput, PurchaseRequestMetadata, { input: CreatePurchaseRequestMetadataInput; actor: ActivityActor }> {
  protected async preExec(input: CreatePurchaseRequestMetadataInput, actor?: ActivityActor): Promise<{ input: CreatePurchaseRequestMetadataInput; actor: ActivityActor }> {
    const validated = await this.validate<CreatePurchaseRequestMetadataInput>(createPurchaseRequestMetadataSchema, input);

    const { organizationId } = await findScopedParent(validated.purchase_request_id, actor ?? null);

    await DocMetadataFieldModelFactory();
    const field = await DocMetadataFieldModel.findOne({
      where: {
        uuid: validated.sales_doc_metadata_field_id,
        organization_id: organizationId,
        deleted_at: null,
      },
    });
    if (!field) {
      throw new NotFoundException("Document metadata field not found.");
    }

    return { input: validated, actor: actor ?? null };
  }

  protected async execute(context: { input: CreatePurchaseRequestMetadataInput; actor: ActivityActor }): Promise<PurchaseRequestMetadata> {
    const { input } = context;
    await PurchaseRequestMetadataModelFactory();
    let row;
    try {
      row = await PurchaseRequestMetadataModel.create({
        uuid: randomUUID(),
        purchase_request_id: input.purchase_request_id,
        sales_doc_metadata_field_id: input.sales_doc_metadata_field_id,
        value: input.value?.trim(),
        status: input.status ?? "active",
        deleted_at: null,
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("Duplicate purchase request metadata row.");
      }
      throw error;
    }

    return PurchaseRequestMetadataModel.toApi(row.toJSON());
  }

  protected async postExec(
    result: PurchaseRequestMetadata,
    context?: { input: CreatePurchaseRequestMetadataInput; actor: ActivityActor },
  ): Promise<PurchaseRequestMetadata> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "purchase_request_metadata",
      entity_uuid: result.uuid,
      origin: null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
