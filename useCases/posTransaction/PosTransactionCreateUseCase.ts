import Joi from "joi";
import { randomUUID } from "crypto";
import PosTransactionModelFactory, {
  PosTransactionModel,
  type CreatePosTransactionInput,
  type PosTransaction,
  type PosTransactionItem,
} from "@/app/sales/models/PosTransactionModel";
import PosTransactionItemModelFactory, { PosTransactionItemModel } from "@/app/sales/models/PosTransactionItemModel";
import PosSessionModelFactory, { PosSessionModel } from "@/app/sales/models/PosSessionModel";
import CustomerModelFactory, { CustomerModel } from "@/app/sales/models/CustomerModel";
import { assertOrderProduct } from "@/app/sales/useCases/orderItemCheck";
import { closeStaleSessions } from "@/app/sales/libraries/posSession";
import { nextDocNumber } from "@/app/sales/libraries/docNumber";
import { insertMovementRow } from "@/app/warehouse/libraries/insertMovementRow";
import { getSequelizeInstance } from "@/database/sequelize";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { sendPosReceiptEmail, type PosReceipt } from "@/libraries/mail";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import { checkTransaction, settleTransaction, type TransactionBilling } from "@/useCases/TransactionUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import ConflictException from "@/exceptions/ConflictException";
import ForbiddenException from "@/exceptions/ForbiddenException";
import NotFoundException from "@/exceptions/NotFoundException";

const posTransactionItemSchema = Joi.object({
  product_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  variant_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  qty: Joi.number().integer().min(1).required(),
  unit_price: Joi.number().integer().min(0).required(),
  discount_pct: Joi.number().min(0).max(100).default(0),
});

const createPosTransactionSchema = Joi.object({
  session_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  customer_id: Joi.string().uuid({ version: "uuidv4" }).allow(null).optional(),
  warehouse_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  payment_method: Joi.string().valid("cash", "qris", "transfer", "debit_credit").required(),
  tendered: Joi.number().integer().min(0).allow(null).optional(),
  discount_pct: Joi.number().min(0).max(100).default(0),
  fulfillment: Joi.string().valid("system", "paper").default("system"),
  items: Joi.array().items(posTransactionItemSchema).min(1).max(200).required(),
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

/** Warehouse module presence decides whether system posting is possible. */
async function warehouseModulePresent(): Promise<boolean> {
  try {
    const warehouseModule = await import("@/app/warehouse/models/WarehouseModel");
    await warehouseModule.getWarehouseModel();
    return true;
  } catch {
    return false;
  }
}

function snapshotTotals(items: Array<{ qty: number; unit_price: number; discount_pct?: number }>, headerPct: number): {
  priced: Array<{ qty: number; unit_price: number; discount_pct: number; line_total: number }>;
  subtotal: number;
  grand_total: number;
} {
  const priced = items.map((item) => {
    const discount = item.discount_pct ?? 0;
    return {
      qty: item.qty,
      unit_price: item.unit_price,
      discount_pct: discount,
      line_total: PosTransactionModel.lineTotal(item.qty, item.unit_price, discount),
    };
  });
  const subtotal = priced.reduce((sum, item) => sum + item.line_total, 0);
  return { priced, subtotal, grand_total: PosTransactionModel.grandTotal(subtotal, headerPct) };
}

export type PosTransactionCreateContext = {
  input: CreatePosTransactionInput;
  actor: ActivityActor;
  organizationId: string | null;
  sessionUuid: string;
  fulfillment: "system" | "paper";
  tendered: number | null;
  change: number | null;
} & TransactionBilling;

export type PosTransactionCreateResult = PosTransaction & { items: PosTransactionItem[]; receipt: PosReceipt };

export class PosTransactionCreateUseCase extends BaseUseCase<CreatePosTransactionInput, PosTransactionCreateResult, PosTransactionCreateContext> {
  protected async preExec(input: CreatePosTransactionInput, actor?: ActivityActor): Promise<PosTransactionCreateContext> {
    const validated = await this.validate<CreatePosTransactionInput>(createPosTransactionSchema, input);

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    if (typeof actorUuid !== "string") {
      throw new ForbiddenException("Only signed-in cashiers can ring up POS sales.");
    }
    const organizationId =
      (await UserModel.resolveOrganization(actorUuid))?.uuid ?? null;

    // Lazy midnight close before touching the session.
    await closeStaleSessions(organizationId, actor ?? null);

    await PosSessionModelFactory();
    const session = await PosSessionModel.findOne({
      where: { uuid: validated.session_id, deleted_at: null },
    });
    if (!session || (session.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("POS session not found.");
    }
    if (session.status !== "open") {
      throw new ConflictException("POS session is no longer open. Open a fresh shift first.");
    }
    if (session.opened_by !== actorUuid) {
      throw new ForbiddenException("Sales can only be rung up in your own session.");
    }

    // Billing gate runs on every completed-sale attempt.
    const billing = await checkTransaction(actor, "sales:pos-transaction:create:create");

    if (validated.customer_id) {
      await CustomerModelFactory();
      const customer = await CustomerModel.findOne({ where: { uuid: validated.customer_id, deleted_at: null } });
      if (!customer || (customer.organization_id ?? null) !== organizationId) {
        throw new NotFoundException("Customer not found.");
      }
    }

    await assertWarehouseInScope(validated.warehouse_id, organizationId);

    for (const item of validated.items ?? []) {
      await assertOrderProduct(item.product_id, item.variant_id ?? null, organizationId);
    }

    const headerDiscount = validated.discount_pct ?? 0;
    const { grand_total } = snapshotTotals(validated.items ?? [], headerDiscount);

    // Cash must cover the total; other methods ignore tendered entirely.
    let tendered: number | null = null;
    let change: number | null = null;
    if (validated.payment_method === "cash") {
      if (typeof validated.tendered !== "number") {
        throw new BadParameterException("Tendered cash is required for cash payments.");
      }
      if (validated.tendered < grand_total) {
        throw new BadParameterException(`Tendered ${validated.tendered} is less than the total ${grand_total}.`);
      }
      tendered = validated.tendered;
      change = validated.tendered - grand_total;
    }

    const fulfillment = validated.fulfillment === "paper" || !(await warehouseModulePresent()) ? "paper" : "system";

    return {
      input: validated,
      actor: actor ?? null,
      organizationId,
      sessionUuid: session.uuid,
      fulfillment,
      tendered,
      change,
      ...billing,
    };
  }

  protected async execute(context: PosTransactionCreateContext): Promise<PosTransactionCreateResult> {
    const { input, organizationId, fulfillment, tendered, change } = context;
    await PosTransactionModelFactory();
    await PosTransactionItemModelFactory();

    const headerDiscount = input.discount_pct ?? 0;
    const { priced, subtotal, grand_total } = snapshotTotals(input.items ?? [], headerDiscount);
    const receiptNo = await nextDocNumber("POS", organizationId);

    const sequelize = await getSequelizeInstance();
    const created = await sequelize.transaction(async (transaction: any) => {
      const header = await PosTransactionModel.create(
        {
          uuid: randomUUID(),
          organization_id: organizationId ?? null,
          session_id: context.sessionUuid,
          customer_id: input.customer_id ?? null,
          warehouse_id: input.warehouse_id,
          payment_method: input.payment_method,
          tendered,
          change,
          subtotal,
          discount_pct: headerDiscount,
          grand_total,
          fulfillment,
          stock_deducted: fulfillment === "system",
          receipt_no: receiptNo,
          receipt_channel: input.customer_id ? "email" : "print",
          status: "completed",
          deleted_at: null,
        },
        { transaction },
      );

      const items = [];
      for (const [index, item] of priced.entries()) {
        const source = (input.items ?? [])[index];
        const row = await PosTransactionItemModel.create(
          {
            uuid: randomUUID(),
            transaction_id: header.uuid,
            product_id: source.product_id,
            variant_id: source.variant_id ?? null,
            qty: source.qty,
            unit_price: source.unit_price,
            discount_pct: item.discount_pct,
            line_total: item.line_total,
            deleted_at: null,
          },
          { transaction },
        );
        items.push(PosTransactionItemModel.toApi(row.toJSON()));
      }

      if (fulfillment === "system") {
        // Shortage on any line throws 422 and rolls the whole sale back.
        for (const item of items) {
          await insertMovementRow(
            {
              warehouse_id: input.warehouse_id,
              product_id: item.product_id,
              variant_id: item.variant_id,
              type: "out",
              qty: item.qty,
              ref_type: "pos-transaction",
              ref_id: header.uuid,
              notes: receiptNo,
            },
            organizationId,
            { transaction },
          );
        }
      }

      return { header, items };
    });

    const api = PosTransactionModel.toApi(created.header.toJSON()) as PosTransaction;
    (api as PosTransaction & { items: PosTransactionItem[] }).items = created.items;

    const receipt = buildReceipt(api, created.items, context);
    return { ...api, items: created.items, receipt };
  }

  protected async postExec(result: PosTransactionCreateResult, context?: PosTransactionCreateContext): Promise<PosTransactionCreateResult> {
    await settleTransaction({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "pos_transaction",
      entity_uuid: result.uuid,
      origin: null,
      updated: result as unknown as Record<string, unknown>,
      billing: context ?? null,
    });

    // Receipt dispatch runs after billing settles and never fails the sale.
    try {
      if (result.customer_id) {
        await CustomerModelFactory();
        const customer = await CustomerModel.findOne({ where: { uuid: result.customer_id, deleted_at: null } });
        const email = customer?.email?.trim() || "";
        if (email) {
          const sent = await sendPosReceiptEmail(email, result.receipt);
          if (sent) {
            await PosTransactionModelFactory();
            await PosTransactionModel.update(
              { receipt_sent_at: new Date(), updated_at: new Date() },
              { where: { uuid: result.uuid } },
            );
            result = { ...result, receipt_sent_at: new Date().toISOString(), receipt: { ...result.receipt, sent_at: new Date().toISOString() } };
          }
        }
      }
    } catch (error) {
      console.error("POS receipt dispatch failed (sale already completed).", error);
    }

    return super.postExec(result, context);
  }
}

/** Builds the receipt payload returned with the completed sale. */
export function buildReceipt(
  txn: PosTransaction,
  items: PosTransactionItem[],
  context?: { actor?: ActivityActor; organizationId?: string | null },
): PosReceipt {
  const actor = (context?.actor as Record<string, unknown> | null) ?? null;
  return {
    receipt_no: txn.receipt_no ?? "",
    channel: (txn.receipt_channel ?? "print") as "print" | "email",
    sent_at: txn.receipt_sent_at,
    status: txn.status,
    paper_stock_note: txn.fulfillment === "paper",
    session_id: txn.session_id,
    cashier: typeof actor?.name === "string" ? actor.name : typeof actor?.email === "string" ? actor.email : null,
    warehouse_id: txn.warehouse_id,
    customer_id: txn.customer_id,
    payment_method: txn.payment_method,
    tendered: txn.tendered,
    change: txn.change,
    subtotal: txn.subtotal,
    discount_pct: txn.discount_pct,
    grand_total: txn.grand_total,
    lines: items.map((item) => ({
      product_id: item.product_id,
      variant_id: item.variant_id,
      qty: item.qty,
      unit_price: item.unit_price,
      discount_pct: item.discount_pct,
      line_total: item.line_total,
    })),
    created_at: txn.created_at,
  };
}
