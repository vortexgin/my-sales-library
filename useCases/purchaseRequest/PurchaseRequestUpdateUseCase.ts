import Joi from "joi";
import PurchaseRequestModelFactory, { PurchaseRequestModel, type PurchaseRequest } from "@/app/sales/models/PurchaseRequestModel";
import { syncPurchaseRequestMetadata, type PurchaseRequestMetadataNestedItem } from "@/app/sales/libraries/purchaseRequestMetadataSync";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";

const purchaseRequestMetadataNestedSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).optional(),
  sales_doc_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  field_name: Joi.string().trim().min(2).max(160).optional(),
  value: Joi.string().trim().min(1).required(),
}).or("uuid", "sales_doc_metadata_field_id", "field_name");

const updatePurchaseRequestSchema = Joi.object({
  warehouse_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  discount_pct: Joi.number().min(0).max(100).optional(),
  notes: Joi.string().trim().allow("", null).optional(),
  status: Joi.string().valid("draft", "submitted", "approved", "rejected", "closed").optional(),
  metadata: Joi.array().items(purchaseRequestMetadataNestedSchema).max(100).optional(),
}).unknown(false).min(1);

/**
 * Valid source → target transitions. `rejected` and `closed` are terminal;
 * same-status writes are no-ops and always allowed. Non-status field
 * updates never touch this map.
 */
const PR_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "rejected"],
  submitted: ["approved", "rejected"],
  approved: ["closed", "rejected"],
  rejected: [],
  closed: [],
};

export class PurchaseRequestUpdateUseCase extends BaseUseCase<string, PurchaseRequest, { uuid: string; input: Record<string, unknown>; actor: ActivityActor }> {

  private purchaseRequestData?: PurchaseRequestModel | null;
  private beforeData?: PurchaseRequest | null;

  protected async preExec(uuid: string, input: Record<string, unknown>, actor?: ActivityActor): Promise<{ uuid: string; input: Record<string, unknown>; actor: ActivityActor }> {
    const validatedInput = await this.validate<Record<string, unknown>>(updatePurchaseRequestSchema, input);

    await PurchaseRequestModelFactory();
    this.purchaseRequestData = await PurchaseRequestModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.purchaseRequestData) {
      throw new NotFoundException("Purchase request not found")
    }
    this.beforeData = PurchaseRequestModel.toApi(this.purchaseRequestData?.toJSON());

    const nextStatus = validatedInput.status as string | undefined;
    const currentStatus = this.beforeData.status;
    if (typeof nextStatus === "string" && nextStatus && nextStatus !== currentStatus) {
      const allowed = PR_STATUS_TRANSITIONS[currentStatus] ?? [];
      if (!allowed.includes(nextStatus)) {
        throw new BadParameterException(`Cannot move purchase request from ${currentStatus} to ${nextStatus}.`);
      }
    }

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: Record<string, unknown>; actor: ActivityActor }): Promise<PurchaseRequest> {
    const { uuid, input, actor } = context;
    const nextData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (Object.prototype.hasOwnProperty.call(input, "warehouse_id")) {
      nextData.warehouse_id = (input.warehouse_id as string | null) ?? null;
    }

    if (typeof input.discount_pct === "number") {
      nextData.discount_pct = input.discount_pct;
      const subtotal = this.beforeData?.subtotal ?? 0;
      nextData.grand_total = PurchaseRequestModel.grandTotal(subtotal, input.discount_pct);
    }

    if (Object.prototype.hasOwnProperty.call(input, "notes")) {
      nextData.notes = (input.notes as string | null)?.trim() || null;
    }

    if (typeof input.status === "string" && input.status) {
      nextData.status = input.status;
    }

    await this.purchaseRequestData?.update(nextData);

    if (Object.prototype.hasOwnProperty.call(input, "metadata")) {
      const api = PurchaseRequestModel.toApi(this.purchaseRequestData?.toJSON());
      await syncPurchaseRequestMetadata(
        uuid,
        input.metadata as PurchaseRequestMetadataNestedItem[] | undefined,
        api.organization_id,
        actor,
      );
    }

    return PurchaseRequestModel.toApi(this.purchaseRequestData?.toJSON());
  }

  protected async postExec(
    result: PurchaseRequest,
    context?: { uuid: string; input: Record<string, unknown>; actor: ActivityActor },
  ): Promise<PurchaseRequest> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "purchase_request",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
