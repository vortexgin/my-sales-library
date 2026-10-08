import Joi from "joi";
import PurchaseRequestMetadataModelFactory, { PurchaseRequestMetadataModel, type PurchaseRequestMetadata } from "@/app/sales/models/PurchaseRequestMetadataModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";
import { findScopedParent } from "@/app/sales/useCases/purchaseRequestMetadata/parentScope";
import type { ActivityActor } from "@/app/base/models/ActivityLogModel";

const getPurchaseRequestMetadataSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class PurchaseRequestMetadataGetUseCase extends BaseUseCase<string, PurchaseRequestMetadata | null, string> {

  private purchaseRequestMetadataData?: PurchaseRequestMetadataModel | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getPurchaseRequestMetadataSchema, { uuid });

    await PurchaseRequestMetadataModelFactory();
    this.purchaseRequestMetadataData = await PurchaseRequestMetadataModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.purchaseRequestMetadataData) {
      throw new NotFoundException("Purchase request metadata not found")
    }

    await findScopedParent(this.purchaseRequestMetadataData.purchase_request_id, actor ?? null);

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<PurchaseRequestMetadata | null> {
    return PurchaseRequestMetadataModel.toApi(this.purchaseRequestMetadataData?.toJSON());
  }
}
