import Joi from "joi";
import SalesOrderModelFactory, { SalesOrderModel, type SalesOrder } from "@/app/sales/models/SalesOrderModel";
import SalesOrderItemModelFactory, { SalesOrderItemModel } from "@/app/sales/models/SalesOrderItemModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getSalesOrderSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class SalesOrderGetUseCase extends BaseUseCase<string, (SalesOrder & { items: unknown[] }) | null, string> {

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getSalesOrderSchema, { uuid });

    await SalesOrderModelFactory();
    const row = await SalesOrderModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!row) {
      throw new NotFoundException("Sales order not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(uuid: string): Promise<(SalesOrder & { items: unknown[] }) | null> {
    await SalesOrderModelFactory();
    const row = await SalesOrderModel.findOne({ where: { uuid, deleted_at: null } });
    if (!row) {
      return null;
    }

    await SalesOrderItemModelFactory();
    const items = await SalesOrderItemModel.findAll({
      where: { sales_order_id: uuid, deleted_at: null },
      order: [["created_at", "ASC"]],
    });

    return {
      ...SalesOrderModel.toApi(row.toJSON()),
      items: items.map((item) => SalesOrderItemModel.toApi(item.toJSON())),
    };
  }
}
