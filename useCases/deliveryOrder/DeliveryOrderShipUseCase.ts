import Joi from "joi";
import DeliveryOrderModelFactory, { DeliveryOrderModel, type DeliveryOrder } from "@/app/sales/models/DeliveryOrderModel";
import DeliveryOrderItemModelFactory, { DeliveryOrderItemModel } from "@/app/sales/models/DeliveryOrderItemModel";
import { insertMovementRow } from "@/app/warehouse/libraries/insertMovementRow";
import { getSequelizeInstance } from "@/database/sequelize";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import { checkTransaction, settleTransaction, type TransactionBilling } from "@/useCases/TransactionUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";

const shipDeliveryOrderSchema = Joi.object({
  fulfillment: Joi.string().valid("system", "paper").required(),
  notes: Joi.string().trim().allow("", null).optional(),
}).unknown(false);

export type DeliveryOrderShipContext = {
  input: { fulfillment: "system" | "paper"; notes?: string | null };
  actor: ActivityActor;
  organizationId: string | null;
} & TransactionBilling;

export class DeliveryOrderShipUseCase extends BaseUseCase<string, DeliveryOrder, DeliveryOrderShipContext> {

  private deliveryOrderData?: DeliveryOrderModel | null;
  private beforeData?: DeliveryOrder | null;

  protected async preExec(
    uuid: string,
    input: { fulfillment: "system" | "paper"; notes?: string | null },
    actor?: ActivityActor,
  ): Promise<DeliveryOrderShipContext> {
    // Billing gate runs on every ship attempt (paper and system alike).
    const billing = await checkTransaction(actor, "sales:delivery-order:view:ship");

    const validatedInput = await this.validate<{ fulfillment: "system" | "paper"; notes?: string | null }>(
      shipDeliveryOrderSchema,
      { fulfillment: input?.fulfillment, notes: input?.notes ?? null },
    );

    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    await DeliveryOrderModelFactory();
    this.deliveryOrderData = await DeliveryOrderModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.deliveryOrderData) {
      throw new NotFoundException("Delivery order not found")
    }
    this.beforeData = DeliveryOrderModel.toApi(this.deliveryOrderData?.toJSON());

    if (["cancelled", "delivered"].includes(this.beforeData.status)) {
      throw new BadParameterException(`Cannot ship a ${this.beforeData.status} delivery order.`);
    }
    if (this.beforeData.status === "shipped" && validatedInput.fulfillment === "paper" && this.beforeData.fulfillment === "system") {
      throw new BadParameterException("System-posted stock cannot revert to paper.");
    }

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    return { input: validatedInput, actor: actor ?? null, organizationId, ...billing };
  }

  protected async execute(context: DeliveryOrderShipContext): Promise<DeliveryOrder> {
    const { input, organizationId } = context;
    const before = this.beforeData as DeliveryOrder;

    // Idempotent re-ship: already system-posted and asking system again.
    if (before.status === "shipped" && before.fulfillment === "system" && before.stock_deducted && input.fulfillment === "system") {
      return before;
    }

    if (input.fulfillment === "system") {
      // Warehouse must exist when posting stock; otherwise guide to paper.
      let warehouseModule: any = null;
      try {
        warehouseModule = await import("@/app/warehouse/models/WarehouseModel");
        await warehouseModule.getWarehouseModel();
      } catch {
        warehouseModule = null;
      }
      if (!warehouseModule) {
        throw new BadParameterException("Warehouse module is unavailable. Ship as paper instead.");
      }

      await DeliveryOrderItemModelFactory();
      const items = await DeliveryOrderItemModel.findAll({
        where: { delivery_order_id: before.uuid, deleted_at: null },
        order: [["created_at", "ASC"]],
      });
      if (items.length === 0) {
        throw new BadParameterException("Delivery order has no items to post.");
      }

      const sequelize = await getSequelizeInstance();
      await sequelize.transaction(async (transaction: any) => {
        for (const item of items) {
          await insertMovementRow(
            {
              warehouse_id: before.warehouse_id,
              product_id: item.product_id,
              variant_id: item.variant_id,
              type: "out",
              qty: item.qty,
              ref_type: "delivery-order",
              ref_id: before.uuid,
              notes: input.notes?.trim() || before.notes,
            },
            organizationId,
            { transaction },
          );
        }
      });

      await this.deliveryOrderData?.update({
        status: "shipped",
        fulfillment: "system",
        stock_deducted: true,
        notes: input.notes?.trim() || before.notes,
        updated_at: new Date(),
      });
    } else {
      await this.deliveryOrderData?.update({
        status: "shipped",
        fulfillment: "paper",
        stock_deducted: false,
        notes: input.notes?.trim() || before.notes,
        updated_at: new Date(),
      });
    }

    return DeliveryOrderModel.toApi(this.deliveryOrderData?.toJSON());
  }

  protected async postExec(result: DeliveryOrder, context?: DeliveryOrderShipContext): Promise<DeliveryOrder> {
    // Settle exactly once: only the first transition into shipped is billed.
    // Paper-then-system re-posts and idempotent re-ships cost nothing extra.
    const wasFirstShip = (this.beforeData?.status ?? null) !== "shipped";
    if (wasFirstShip) {
      await settleTransaction({
        actor: context?.actor ?? null,
        operation: "update",
        entity: "delivery_order",
        entity_uuid: result.uuid,
        origin: this.beforeData ?? null,
        updated: result as unknown as Record<string, unknown>,
        billing: context ?? null,
      });
    } else {
      void recordActivityLog({
        actor: context?.actor ?? null,
        operation: "update",
        entity: "delivery_order",
        entity_uuid: result.uuid,
        origin: this.beforeData ?? null,
        updated: result as unknown as Record<string, unknown>,
      });
    }
    return super.postExec(result, context);
  }
}
