import Joi from "joi";
import DeliveryOrderModelFactory, { DeliveryOrderModel, type DeliveryOrder } from "@/app/sales/models/DeliveryOrderModel";
import DeliveryOrderItemModelFactory, { DeliveryOrderItemModel } from "@/app/sales/models/DeliveryOrderItemModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const deleteDeliveryOrderSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});
export class DeliveryOrderDeleteUseCase extends BaseUseCase<string, boolean, { uuid: string; actor: ActivityActor }> {

  private deliveryOrderData?: DeliveryOrderModel | null;
  private beforeData?: DeliveryOrder | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const validatedUuid = await this.validate<{ uuid: string }>(deleteDeliveryOrderSchema, { uuid });

    await DeliveryOrderModelFactory();
    this.deliveryOrderData = await DeliveryOrderModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.deliveryOrderData) {
      throw new NotFoundException("Delivery order not found")
    }
    this.beforeData = DeliveryOrderModel.toApi(this.deliveryOrderData?.toJSON());
    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor }): Promise<boolean> {
    const { uuid } = context;
    await DeliveryOrderModelFactory();
    const [affectedRows] = await DeliveryOrderModel.update(
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

    await DeliveryOrderItemModelFactory();
    await DeliveryOrderItemModel.update(
      { deleted_at: new Date(), updated_at: new Date() },
      { where: { delivery_order_id: uuid, deleted_at: null } },
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
        entity: "delivery_order",
        entity_uuid: context?.uuid ?? null,
        origin: this.beforeData ?? null,
        updated: null,
      });
    }
    return super.postExec(result, context);
  }
}
