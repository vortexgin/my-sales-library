import { randomUUID } from "crypto";
import Joi from "joi";
import DeliveryOrderModelFactory, { DeliveryOrderModel, type CreateDeliveryOrderInput, type DeliveryOrder } from "@/app/sales/models/DeliveryOrderModel";
import DeliveryOrderItemModelFactory, { DeliveryOrderItemModel } from "@/app/sales/models/DeliveryOrderItemModel";
import SalesOrderModelFactory, { SalesOrderModel } from "@/app/sales/models/SalesOrderModel";
import { assertOrderProduct } from "@/app/sales/useCases/orderItemCheck";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import ForbiddenException from "@/exceptions/ForbiddenException";
import NotFoundException from "@/exceptions/NotFoundException";

const deliveryOrderItemSchema = Joi.object({
  product_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  variant_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  qty: Joi.number().integer().min(1).required(),
});

const createDeliveryOrderSchema = Joi.object({
  sales_order_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  warehouse_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  notes: Joi.string().trim().allow("", null).optional(),
  status: Joi.string().valid("draft", "packed", "cancelled").optional(),
  items: Joi.array().items(deliveryOrderItemSchema).min(1).max(200).required(),
}).unknown(false);

async function assertWarehouseInScope(warehouseId: string, organizationId: string | null): Promise<void> {
  try {
    const { WarehouseModel, getWarehouseModel } = await import("@/app/warehouse/models/WarehouseModel");
    await getWarehouseModel();
    const warehouse = await WarehouseModel.findOne({ where: { uuid: warehouseId, deleted_at: null } });
    if (!warehouse) {
      throw new NotFoundException("Warehouse not found.");
    }
    const warehouseOrg = warehouse.organization_id ?? null;
    if (organizationId && warehouseOrg !== null && warehouseOrg !== organizationId) {
      throw new ForbiddenException("Warehouse belongs to another organization.");
    }
  } catch (error) {
    if (error instanceof NotFoundException || error instanceof ForbiddenException) {
      throw error;
    }
    // Warehouse module absent: store the uuid unchecked.
  }
}

export class DeliveryOrderCreateUseCase extends BaseUseCase<CreateDeliveryOrderInput, DeliveryOrder & { items: unknown[] }, { input: CreateDeliveryOrderInput; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(input: CreateDeliveryOrderInput, actor?: ActivityActor): Promise<{ input: CreateDeliveryOrderInput; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<CreateDeliveryOrderInput>(createDeliveryOrderSchema, input);

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await SalesOrderModelFactory();
    const order = await SalesOrderModel.findOne({ where: { uuid: validated.sales_order_id, deleted_at: null } });
    if (!order) {
      throw new NotFoundException("Sales order not found.");
    }
    const orderOrg = order.organization_id ?? null;
    if (organizationId && orderOrg !== null && orderOrg !== organizationId) {
      throw new ForbiddenException("Sales order belongs to another organization.");
    }

    await assertWarehouseInScope(validated.warehouse_id, organizationId);

    for (const item of validated.items ?? []) {
      await assertOrderProduct(item.product_id, item.variant_id ?? null, organizationId);
    }

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { input: CreateDeliveryOrderInput; actor: ActivityActor; organizationId: string | null }): Promise<DeliveryOrder & { items: unknown[] }> {
    const { input, organizationId } = context;
    await DeliveryOrderModelFactory();
    await DeliveryOrderItemModelFactory();

    const header = await DeliveryOrderModel.create({
      uuid: randomUUID(),
      organization_id: organizationId ?? null,
      sales_order_id: input.sales_order_id,
      warehouse_id: input.warehouse_id,
      status: input.status ?? "draft",
      fulfillment: null,
      stock_deducted: false,
      notes: input.notes?.trim() || null,
      deleted_at: null,
    });

    const items = [];
    for (const item of input.items ?? []) {
      const row = await DeliveryOrderItemModel.create({
        uuid: randomUUID(),
        delivery_order_id: header.uuid,
        product_id: item.product_id,
        variant_id: item.variant_id ?? null,
        qty: item.qty,
        deleted_at: null,
      });
      items.push(DeliveryOrderItemModel.toApi(row.toJSON()));
    }

    return { ...DeliveryOrderModel.toApi(header.toJSON()), items };
  }

  protected async postExec(
    result: DeliveryOrder & { items: unknown[] },
    context?: { input: CreateDeliveryOrderInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<DeliveryOrder & { items: unknown[] }> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "delivery_order",
      entity_uuid: result.uuid,
      origin: null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
