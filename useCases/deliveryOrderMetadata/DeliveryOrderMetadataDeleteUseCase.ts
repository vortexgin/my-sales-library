import Joi from "joi";
import DeliveryOrderMetadataModelFactory, { DeliveryOrderMetadataModel, type DeliveryOrderMetadata } from "@/app/sales/models/DeliveryOrderMetadataModel";
import { assertDeliveryOrderInScope } from "@/app/sales/useCases/deliveryOrderMetadata/deliveryOrderMetadataScope";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const deleteDeliveryOrderMetadataSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});
export class DeliveryOrderMetadataDeleteUseCase extends BaseUseCase<string, boolean, { uuid: string; actor: ActivityActor }> {

  private deliveryOrderMetadataData?: DeliveryOrderMetadataModel | null;
  private beforeData?: DeliveryOrderMetadata | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const validatedUuid = await this.validate<{ uuid: string }>(deleteDeliveryOrderMetadataSchema, { uuid });

    await DeliveryOrderMetadataModelFactory();
    this.deliveryOrderMetadataData = await DeliveryOrderMetadataModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.deliveryOrderMetadataData) {
      throw new NotFoundException("Delivery order metadata not found")
    }
    this.beforeData = DeliveryOrderMetadataModel.toApi(this.deliveryOrderMetadataData?.toJSON());
    await assertDeliveryOrderInScope(this.deliveryOrderMetadataData.sales_delivery_order_id, actor ?? null);
    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor }): Promise<boolean> {
    const { uuid } = context;
    await DeliveryOrderMetadataModelFactory();
    const [affectedRows] = await DeliveryOrderMetadataModel.update(
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
        entity: "delivery_order_metadata",
        entity_uuid: context?.uuid ?? null,
        origin: this.beforeData ?? null,
        updated: null,
      });
    }
    return super.postExec(result, context);
  }
}
