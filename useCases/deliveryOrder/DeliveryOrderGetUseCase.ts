import Joi from "joi";
import DeliveryOrderModelFactory, { DeliveryOrderModel, type DeliveryOrder } from "@/app/sales/models/DeliveryOrderModel";
import DeliveryOrderItemModelFactory, { DeliveryOrderItemModel } from "@/app/sales/models/DeliveryOrderItemModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getDeliveryOrderSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class DeliveryOrderGetUseCase extends BaseUseCase<string, (DeliveryOrder & { items: unknown[] }) | null, string> {

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getDeliveryOrderSchema, { uuid });

    await DeliveryOrderModelFactory();
    const row = await DeliveryOrderModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!row) {
      throw new NotFoundException("Delivery order not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(uuid: string): Promise<(DeliveryOrder & { items: unknown[] }) | null> {
    await DeliveryOrderModelFactory();
    const row = await DeliveryOrderModel.findOne({ where: { uuid, deleted_at: null } });
    if (!row) {
      return null;
    }

    await DeliveryOrderItemModelFactory();
    const items = await DeliveryOrderItemModel.findAll({
      where: { delivery_order_id: uuid, deleted_at: null },
      order: [["created_at", "ASC"]],
    });

    return {
      ...DeliveryOrderModel.toApi(row.toJSON()),
      items: items.map((item) => DeliveryOrderItemModel.toApi(item.toJSON())),
    };
  }
}
