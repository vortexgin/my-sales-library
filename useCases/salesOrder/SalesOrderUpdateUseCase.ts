import Joi from "joi";
import SalesOrderModelFactory, { SalesOrderModel, type SalesOrder, type UpdateSalesOrderInput } from "@/app/sales/models/SalesOrderModel";
import SalesOrderItemModelFactory, { SalesOrderItemModel } from "@/app/sales/models/SalesOrderItemModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const updateSalesOrderSchema = Joi.object({
  warehouse_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  discount_pct: Joi.number().min(0).max(100).optional(),
  notes: Joi.string().trim().allow("", null).optional(),
  status: Joi.string().valid("draft", "confirmed", "paid", "shipped", "cancelled").optional(),
}).unknown(false).min(1);

export class SalesOrderUpdateUseCase extends BaseUseCase<string, SalesOrder, { uuid: string; input: UpdateSalesOrderInput; actor: ActivityActor }> {

  private salesOrderData?: SalesOrderModel | null;
  private beforeData?: SalesOrder | null;

  protected async preExec(uuid: string, input: UpdateSalesOrderInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateSalesOrderInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateSalesOrderInput>(updateSalesOrderSchema, input);

    await SalesOrderModelFactory();
    this.salesOrderData = await SalesOrderModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.salesOrderData) {
      throw new NotFoundException("Sales order not found")
    }
    this.beforeData = SalesOrderModel.toApi(this.salesOrderData?.toJSON());

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateSalesOrderInput; actor: ActivityActor }): Promise<SalesOrder> {
    const { input } = context;
    const nextData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (Object.prototype.hasOwnProperty.call(input, "warehouse_id")) {
      nextData.warehouse_id = (input.warehouse_id as string | null) ?? null;
    }

    if (typeof input.discount_pct === "number") {
      nextData.discount_pct = input.discount_pct;
      const subtotal = this.beforeData?.subtotal ?? 0;
      nextData.grand_total = SalesOrderModel.grandTotal(subtotal, input.discount_pct);
    }

    if (Object.prototype.hasOwnProperty.call(input, "notes")) {
      nextData.notes = (input.notes as string | null)?.trim() || null;
    }

    if (typeof input.status === "string" && input.status) {
      nextData.status = input.status;
    }

    await this.salesOrderData?.update(nextData);

    await SalesOrderItemModelFactory();
    const items = await SalesOrderItemModel.findAll({
      where: { sales_order_id: context.uuid, deleted_at: null },
      order: [["created_at", "ASC"]],
    });

    return {
      ...SalesOrderModel.toApi(this.salesOrderData?.toJSON()),
      items: items.map((item) => SalesOrderItemModel.toApi(item.toJSON())),
    } as SalesOrder;
  }

  protected async postExec(
    result: SalesOrder,
    context?: { uuid: string; input: UpdateSalesOrderInput; actor: ActivityActor },
  ): Promise<SalesOrder> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "sales-order",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
