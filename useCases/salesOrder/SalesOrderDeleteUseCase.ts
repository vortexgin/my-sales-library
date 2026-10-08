import Joi from "joi";
import SalesOrderModelFactory, { SalesOrderModel, type SalesOrder } from "@/app/sales/models/SalesOrderModel";
import SalesOrderItemModelFactory, { SalesOrderItemModel } from "@/app/sales/models/SalesOrderItemModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const deleteSalesOrderSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});
export class SalesOrderDeleteUseCase extends BaseUseCase<string, boolean, { uuid: string; actor: ActivityActor }> {

  private salesOrderData?: SalesOrderModel | null;
  private beforeData?: SalesOrder | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const validatedUuid = await this.validate<{ uuid: string }>(deleteSalesOrderSchema, { uuid });

    await SalesOrderModelFactory();
    this.salesOrderData = await SalesOrderModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.salesOrderData) {
      throw new NotFoundException("Sales order not found")
    }
    this.beforeData = SalesOrderModel.toApi(this.salesOrderData?.toJSON());
    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor }): Promise<boolean> {
    const { uuid } = context;
    await SalesOrderModelFactory();
    const [affectedRows] = await SalesOrderModel.update(
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

    await SalesOrderItemModelFactory();
    await SalesOrderItemModel.update(
      { deleted_at: new Date(), updated_at: new Date() },
      { where: { sales_order_id: uuid, deleted_at: null } },
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
        entity: "sales-order",
        entity_uuid: context?.uuid ?? null,
        origin: this.beforeData ?? null,
        updated: null,
      });
    }
    return super.postExec(result, context);
  }
}
