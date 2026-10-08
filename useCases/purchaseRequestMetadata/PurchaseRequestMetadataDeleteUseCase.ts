import Joi from "joi";
import PurchaseRequestMetadataModelFactory, { PurchaseRequestMetadataModel, type PurchaseRequestMetadata } from "@/app/sales/models/PurchaseRequestMetadataModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";
import { findScopedParent } from "@/app/sales/useCases/purchaseRequestMetadata/parentScope";

const deletePurchaseRequestMetadataSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});
export class PurchaseRequestMetadataDeleteUseCase extends BaseUseCase<string, boolean, { uuid: string; actor: ActivityActor }> {

  private purchaseRequestMetadataData?: PurchaseRequestMetadataModel | null;
  private beforeData?: PurchaseRequestMetadata | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const validatedUuid = await this.validate<{ uuid: string }>(deletePurchaseRequestMetadataSchema, { uuid });

    await PurchaseRequestMetadataModelFactory();
    this.purchaseRequestMetadataData = await PurchaseRequestMetadataModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.purchaseRequestMetadataData) {
      throw new NotFoundException("Purchase request metadata not found")
    }
    this.beforeData = PurchaseRequestMetadataModel.toApi(this.purchaseRequestMetadataData?.toJSON());

    await findScopedParent(this.purchaseRequestMetadataData.purchase_request_id, actor ?? null);

    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor }): Promise<boolean> {
    const { uuid } = context;
    await PurchaseRequestMetadataModelFactory();
    const [affectedRows] = await PurchaseRequestMetadataModel.update(
      {
        status: "deleted",
        deleted_at: new Date(),
        updated_at: new Date(),
      },
      {
        where: { uuid, deleted_at: null },
      },
    );

    return affectedRows > 0;
  }

  protected async postExec(
    result: boolean,
    context?: { uuid: string; actor: ActivityActor },
  ): Promise<boolean> {
    if (result) {
      void recordActivityLog({
        actor: context?.actor ?? null,
        operation: "delete",
        entity: "purchase_request_metadata",
        entity_uuid: context?.uuid ?? null,
        origin: this.beforeData ?? null,
        updated: null,
      });
    }
    return super.postExec(result, context);
  }
}
