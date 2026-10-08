import { randomUUID } from "crypto";
import Joi from "joi";
import SalesOrderModelFactory, { SalesOrderModel, type CreateSalesOrderInput, type SalesOrder } from "@/app/sales/models/SalesOrderModel";
import SalesOrderItemModelFactory, { SalesOrderItemModel } from "@/app/sales/models/SalesOrderItemModel";
import PurchaseRequestModelFactory, { PurchaseRequestModel } from "@/app/sales/models/PurchaseRequestModel";
import CustomerModelFactory, { CustomerModel } from "@/app/sales/models/CustomerModel";
import { assertOrderProduct } from "@/app/sales/useCases/orderItemCheck";
import { nextDocNumber } from "@/app/sales/libraries/docNumber";
import { syncSalesOrderMetadata, type SalesOrderMetadataNestedItem } from "@/app/sales/libraries/salesOrderMetadataSync";
import { UserModel } from "@/app/base/models/UserModel";
import type { ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import { checkTransaction, settleTransaction, type TransactionBilling } from "@/useCases/TransactionUseCase";
import ForbiddenException from "@/exceptions/ForbiddenException";
import NotFoundException from "@/exceptions/NotFoundException";

const salesOrderItemSchema = Joi.object({
  product_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  variant_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  qty: Joi.number().integer().min(1).required(),
  unit_price: Joi.number().integer().min(0).required(),
  discount_pct: Joi.number().min(0).max(100).default(0),
  notes: Joi.string().trim().allow("", null).optional(),
});

const salesOrderMetadataNestedSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).optional(),
  sales_doc_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  field_name: Joi.string().trim().min(2).max(160).optional(),
  value: Joi.string().trim().min(1).required(),
}).or("uuid", "sales_doc_metadata_field_id", "field_name");

const createSalesOrderSchema = Joi.object({
  customer_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  purchase_request_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  warehouse_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  discount_pct: Joi.number().min(0).max(100).default(0),
  notes: Joi.string().trim().allow("", null).optional(),
  status: Joi.string().valid("draft", "confirmed", "paid", "shipped", "cancelled").optional(),
  items: Joi.array().items(salesOrderItemSchema).min(1).max(200).required(),
  metadata: Joi.array().items(salesOrderMetadataNestedSchema).max(100).optional(),
}).unknown(false);

export type SalesOrderCreateContext = { input: CreateSalesOrderInput; actor: ActivityActor; organizationId: string | null } & TransactionBilling;

export class SalesOrderCreateUseCase extends BaseUseCase<CreateSalesOrderInput, SalesOrder & { items: unknown[] }, SalesOrderCreateContext> {
  protected async preExec(input: CreateSalesOrderInput, actor?: ActivityActor): Promise<SalesOrderCreateContext> {
    const billing = await checkTransaction(actor, "sales:sales-order:create:create");

    const validated = await this.validate<CreateSalesOrderInput>(createSalesOrderSchema, input);

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

    if (validated.purchase_request_id) {
      await PurchaseRequestModelFactory();
      const pr = await PurchaseRequestModel.findOne({ where: { uuid: validated.purchase_request_id, deleted_at: null } });
      if (!pr) {
        throw new NotFoundException("Purchase request not found.");
      }
      if (organizationId && (pr.organization_id ?? null) !== organizationId) {
        throw new ForbiddenException("Purchase request belongs to another organization.");
      }
    }

    for (const item of validated.items ?? []) {
      await assertOrderProduct(item.product_id, item.variant_id ?? null, organizationId);
    }

    return { input: validated, actor: actor ?? null, organizationId, ...billing };
  }

  protected async execute(context: SalesOrderCreateContext): Promise<SalesOrder & { items: unknown[] }> {
    const { input, organizationId } = context;
    await SalesOrderModelFactory();
    await SalesOrderItemModelFactory();

    const headerDiscount = input.discount_pct ?? 0;
    const priced = (input.items ?? []).map((item) => {
      const discount = item.discount_pct ?? 0;
      return { ...item, discount_pct: discount, line_total: SalesOrderModel.lineTotal(item.qty, item.unit_price, discount) };
    });
    const subtotal = priced.reduce((sum, item) => sum + item.line_total, 0);

    const header = await SalesOrderModel.create({
      uuid: randomUUID(),
      organization_id: organizationId ?? null,
      doc_number: await nextDocNumber("SO", organizationId),
      customer_id: input.customer_id,
      purchase_request_id: input.purchase_request_id ?? null,
      warehouse_id: input.warehouse_id ?? null,
      status: input.status ?? "draft",
      subtotal,
      discount_pct: headerDiscount,
      grand_total: SalesOrderModel.grandTotal(subtotal, headerDiscount),
      notes: input.notes?.trim() || null,
      deleted_at: null,
    });

    const items = [];
    for (const item of priced) {
      const row = await SalesOrderItemModel.create({
        uuid: randomUUID(),
        sales_order_id: header.uuid,
        product_id: item.product_id,
        variant_id: item.variant_id ?? null,
        qty: item.qty,
        unit_price: item.unit_price,
        discount_pct: item.discount_pct,
        line_total: item.line_total,
        notes: item.notes?.trim() || null,
        deleted_at: null,
      });
      items.push(SalesOrderItemModel.toApi(row.toJSON()));
    }

    await syncSalesOrderMetadata(
      header.uuid,
      input.metadata as SalesOrderMetadataNestedItem[] | undefined,
      organizationId,
      context.actor,
    );

    // Best-effort PR close, in scope: never fail the order for it.
    if (input.purchase_request_id) {
      try {
        await PurchaseRequestModelFactory();
        await PurchaseRequestModel.update(
          { status: "closed", updated_at: new Date() },
          { where: { uuid: input.purchase_request_id, deleted_at: null } },
        );
      } catch {
        // Best effort only.
      }
    }

    return { ...SalesOrderModel.toApi(header.toJSON()), items };
  }

  protected async postExec(
    result: SalesOrder & { items: unknown[] },
    context?: SalesOrderCreateContext,
  ): Promise<SalesOrder & { items: unknown[] }> {
    await settleTransaction({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "sales-order",
      entity_uuid: result.uuid,
      origin: null,
      updated: result as unknown as Record<string, unknown>,
      billing: context ?? null,
    });
    return super.postExec(result, context);
  }
}
