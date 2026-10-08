import { randomUUID } from "crypto";
import Joi from "joi";
import PurchaseRequestModelFactory, { PurchaseRequestModel, type CreatePurchaseRequestInput, type PurchaseRequest } from "@/app/sales/models/PurchaseRequestModel";
import PurchaseRequestItemModelFactory, { PurchaseRequestItemModel } from "@/app/sales/models/PurchaseRequestItemModel";
import CustomerModelFactory, { CustomerModel } from "@/app/sales/models/CustomerModel";
import { assertOrderProduct } from "@/app/sales/useCases/orderItemCheck";
import { syncPurchaseRequestMetadata, type PurchaseRequestMetadataNestedItem } from "@/app/sales/libraries/purchaseRequestMetadataSync";
import { nextDocNumber } from "@/app/sales/libraries/docNumber";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import ForbiddenException from "@/exceptions/ForbiddenException";
import NotFoundException from "@/exceptions/NotFoundException";

const purchaseRequestItemSchema = Joi.object({
  product_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  variant_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  qty: Joi.number().integer().min(1).required(),
  unit_price: Joi.number().integer().min(0).required(),
  discount_pct: Joi.number().min(0).max(100).default(0),
  notes: Joi.string().trim().allow("", null).optional(),
});

const purchaseRequestMetadataNestedSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).optional(),
  sales_doc_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  field_name: Joi.string().trim().min(2).max(160).optional(),
  value: Joi.string().trim().min(1).required(),
}).or("uuid", "sales_doc_metadata_field_id", "field_name");

const createPurchaseRequestSchema = Joi.object({
  customer_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  warehouse_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  discount_pct: Joi.number().min(0).max(100).default(0),
  notes: Joi.string().trim().allow("", null).optional(),
  // New requests always start as draft (transitions go through update).
  status: Joi.string().valid("draft").optional(),
  items: Joi.array().items(purchaseRequestItemSchema).min(1).max(200).required(),
  metadata: Joi.array().items(purchaseRequestMetadataNestedSchema).max(100).optional(),
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

export class PurchaseRequestCreateUseCase extends BaseUseCase<CreatePurchaseRequestInput, PurchaseRequest & { items: unknown[] }, { input: CreatePurchaseRequestInput; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(input: CreatePurchaseRequestInput, actor?: ActivityActor): Promise<{ input: CreatePurchaseRequestInput; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<CreatePurchaseRequestInput>(createPurchaseRequestSchema, input);

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await CustomerModelFactory();
    const customer = await CustomerModel.findOne({ where: { uuid: validated.customer_id, deleted_at: null } });
    if (!customer) {
      throw new NotFoundException("Customer not found.");
    }
    const customerOrg = customer.organization_id ?? null;
    if (organizationId && customerOrg !== null && customerOrg !== organizationId) {
      throw new ForbiddenException("Customer belongs to another organization.");
    }

    if (validated.warehouse_id) {
      await assertWarehouseInScope(validated.warehouse_id, organizationId);
    }

    for (const item of validated.items ?? []) {
      await assertOrderProduct(item.product_id, item.variant_id ?? null, organizationId);
    }

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { input: CreatePurchaseRequestInput; actor: ActivityActor; organizationId: string | null }): Promise<PurchaseRequest & { items: unknown[] }> {
    const { input, organizationId, actor } = context;
    await PurchaseRequestModelFactory();
    await PurchaseRequestItemModelFactory();

    const headerDiscount = input.discount_pct ?? 0;
    const priced = (input.items ?? []).map((item) => {
      const discount = item.discount_pct ?? 0;
      return { ...item, discount_pct: discount, line_total: PurchaseRequestModel.lineTotal(item.qty, item.unit_price, discount) };
    });
    const subtotal = priced.reduce((sum, item) => sum + item.line_total, 0);

    const header = await PurchaseRequestModel.create({
      uuid: randomUUID(),
      organization_id: organizationId ?? null,
      doc_number: await nextDocNumber("PR", organizationId),
      customer_id: input.customer_id,
      warehouse_id: input.warehouse_id ?? null,
      status: "draft",
      subtotal,
      discount_pct: headerDiscount,
      grand_total: PurchaseRequestModel.grandTotal(subtotal, headerDiscount),
      notes: input.notes?.trim() || null,
      deleted_at: null,
    });

    const items = [];
    for (const item of priced) {
      const row = await PurchaseRequestItemModel.create({
        uuid: randomUUID(),
        purchase_request_id: header.uuid,
        product_id: item.product_id,
        variant_id: item.variant_id ?? null,
        qty: item.qty,
        unit_price: item.unit_price,
        discount_pct: item.discount_pct,
        line_total: item.line_total,
        notes: item.notes?.trim() || null,
        deleted_at: null,
      });
      items.push(PurchaseRequestItemModel.toApi(row.toJSON()));
    }

    await syncPurchaseRequestMetadata(
      header.uuid,
      input.metadata as PurchaseRequestMetadataNestedItem[] | undefined,
      organizationId,
      actor,
    );

    return { ...PurchaseRequestModel.toApi(header.toJSON()), items };
  }

  protected async postExec(
    result: PurchaseRequest & { items: unknown[] },
    context?: { input: CreatePurchaseRequestInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<PurchaseRequest & { items: unknown[] }> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "purchase_request",
      entity_uuid: result.uuid,
      origin: null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
