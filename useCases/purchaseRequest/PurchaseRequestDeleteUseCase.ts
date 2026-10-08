import Joi from "joi";
import PurchaseRequestModelFactory, { PurchaseRequestModel, type PurchaseRequest } from "@/app/sales/models/PurchaseRequestModel";
import PurchaseRequestItemModelFactory, { PurchaseRequestItemModel } from "@/app/sales/models/PurchaseRequestItemModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const deletePurchaseRequestSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});
export class PurchaseRequestDeleteUseCase extends BaseUseCase<string, boolean, { uuid: string; actor: ActivityActor }> {

  private purchaseRequestData?: PurchaseRequestModel | null;
  private beforeData?: PurchaseRequest | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const validatedUuid = await this.validate<{ uuid: string }>(deletePurchaseRequestSchema, { uuid });

    await PurchaseRequestModelFactory();
    this.purchaseRequestData = await PurchaseRequestModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.purchaseRequestData) {
      throw new NotFoundException("Purchase request not found")
    }
    this.beforeData = PurchaseRequestModel.toApi(this.purchaseRequestData?.toJSON());
    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor }): Promise<boolean> {
    const { uuid } = context;
    await PurchaseRequestModelFactory();
    const [affectedRows] = await PurchaseRequestModel.update(
      {
        deleted_at: new Date(),
        updated_at: new Date(),
      },
      {
        where: { uuid, deleted_at: null },
      },
    );
    if (affectedRows === 0) {
      return false;
    }

    await PurchaseRequestItemModelFactory();
    await PurchaseRequestItemModel.update(
      { deleted_at: new Date(), updated_at: new Date() },
      { where: { purchase_request_id: uuid, deleted_at: null } },
    );

    return true;
  }

  protected async postExec(
    result: boolean,
    context?: { uuid: string; actor: ActivityActor },
  ): Promise<boolean> {
    if (result) {
      void recordActivityLog({
        actor: context?.actor ?? null,
        operation: "delete",
        entity: "purchase_request",
        entity_uuid: context?.uuid ?? null,
        origin: this.beforeData ?? null,
        updated: null,
      });
    }
    return super.postExec(result, context);
  }
}
