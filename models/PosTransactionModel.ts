import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type PosPaymentMethod = "cash" | "qris" | "transfer" | "debit_credit";
export type PosFulfillment = "system" | "paper";
export type PosReceiptChannel = "print" | "email";
export type PosTransactionStatus = "completed" | "voided";

export type PosTransactionItemInput = {
  product_id: string;
  variant_id?: string | null;
  qty: number;
  unit_price: number;
  discount_pct?: number;
};

export type PosTransactionItem = {
  uuid: string;
  transaction_id: string;
  product_id: string;
  variant_id: string | null;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
  /** Relation labels resolved in the Get useCase (UUID fallback on pages). Null when not loaded. */
  product_sku: string | null;
  product_name: string | null;
  variant_sku: string | null;
  variant_name: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PosTransactionCustomer = {
  id: string;
  name: string;
  email: string;
};

export type PosTransactionWarehouse = {
  id: string;
  code: string;
  name: string;
};

export type PosTransaction = {
  uuid: string;
  organization_id: string | null;
  session_id: string;
  customer_id: string | null;
  warehouse_id: string;
  payment_method: PosPaymentMethod;
  tendered: number | null;
  change: number | null;
  subtotal: number;
  discount_pct: number;
  grand_total: number;
  fulfillment: PosFulfillment;
  stock_deducted: boolean;
  receipt_no: string | null;
  receipt_channel: PosReceiptChannel | null;
  receipt_sent_at: string | null;
  status: PosTransactionStatus;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  items?: PosTransactionItem[];
  /** Relation labels come from eager-loaded associations, not stored snapshots. Null when absent. */
  customer: PosTransactionCustomer | null;
  warehouse: PosTransactionWarehouse | null;
};

export type CreatePosTransactionInput = {
  session_id: string;
  customer_id?: string | null;
  warehouse_id: string;
  payment_method: PosPaymentMethod;
  tendered?: number | null;
  discount_pct?: number;
  fulfillment?: PosFulfillment;
  items: PosTransactionItemInput[];
};

export type PosTransactionModelAttributes = Partial<
  Omit<PosTransaction, "created_at" | "updated_at" | "deleted_at" | "receipt_sent_at" | "items" | "customer" | "warehouse">
> & {
  receipt_sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type PosTransactionModelCreationAttributes = Partial<PosTransactionModelAttributes>;

export class PosTransactionModel extends Model<PosTransactionModelAttributes, PosTransactionModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare session_id: string;
  declare customer_id: string | null;
  declare warehouse_id: string;
  declare payment_method: PosPaymentMethod;
  declare tendered: number | null;
  declare change: number | null;
  declare subtotal: number;
  declare discount_pct: number;
  declare grand_total: number;
  declare fulfillment: PosFulfillment;
  declare stock_deducted: boolean;
  declare receipt_no: string | null;
  declare receipt_channel: PosReceiptChannel | null;
  declare receipt_sent_at: Date | null;
  declare status: PosTransactionStatus;
  declare void_reason: string | null;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static lineTotal(qty: number, unitPrice: number, discountPct: number): number {
    return Math.round(qty * unitPrice * (1 - discountPct / 100));
  }

  static grandTotal(subtotal: number, discountPct: number): number {
    return Math.round(subtotal * (1 - discountPct / 100));
  }

  static toApi(row: any): PosTransaction {
    const customer = row.customer ?? null;
    const warehouse = row.warehouse ?? null;
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      session_id: row.session_id,
      customer_id: row.customer_id ?? null,
      warehouse_id: row.warehouse_id,
      payment_method: row.payment_method,
      tendered: typeof row.tendered === "number" ? row.tendered : null,
      change: typeof row.change === "number" ? row.change : null,
      subtotal: typeof row.subtotal === "number" ? row.subtotal : 0,
      discount_pct: typeof row.discount_pct === "number" ? row.discount_pct : 0,
      grand_total: typeof row.grand_total === "number" ? row.grand_total : 0,
      fulfillment: row.fulfillment ?? "system",
      stock_deducted: Boolean(row.stock_deducted),
      receipt_no: row.receipt_no ?? null,
      receipt_channel: row.receipt_channel ?? null,
      receipt_sent_at: row.receipt_sent_at ? new Date(row.receipt_sent_at).toISOString() : null,
      status: row.status,
      void_reason: row.void_reason ?? null,
      customer: customer ? { id: customer.uuid ?? "", name: customer.name ?? "", email: customer.email ?? "" } : null,
      warehouse: warehouse
        ? { id: warehouse.uuid ?? "", code: warehouse.code ?? "", name: warehouse.name ?? "" }
        : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let posTransactionModelPromise: Promise<typeof PosTransactionModel> | null = null;

export async function getPosTransactionModel(): Promise<typeof PosTransactionModel> {
  if ((PosTransactionModel as any).initialized) {
    return PosTransactionModel;
  }
  if (!posTransactionModelPromise) {
    posTransactionModelPromise = initPosTransactionModel().catch((error) => {
      posTransactionModelPromise = null;
      throw error;
    });
  }
  return posTransactionModelPromise;
}

async function initPosTransactionModel(): Promise<typeof PosTransactionModel> {
  const sequelize = await getSequelizeInstance();

  {
    PosTransactionModel.init(
      {
        uuid: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        organization_id: {
          type: DataTypes.UUID,
          allowNull: true,
          defaultValue: null,
        },
        session_id: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        customer_id: {
          type: DataTypes.UUID,
          allowNull: true,
          defaultValue: null,
        },
        warehouse_id: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        payment_method: {
          type: DataTypes.ENUM("cash", "qris", "transfer", "debit_credit"),
          allowNull: false,
        },
        tendered: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: null,
        },
        change: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: null,
        },
        subtotal: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        discount_pct: {
          type: DataTypes.FLOAT,
          allowNull: false,
          defaultValue: 0,
        },
        grand_total: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        fulfillment: {
          type: DataTypes.ENUM("system", "paper"),
          allowNull: false,
          defaultValue: "system",
        },
        stock_deducted: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        receipt_no: {
          type: DataTypes.STRING(40),
          allowNull: true,
          defaultValue: null,
        },
        receipt_channel: {
          type: DataTypes.ENUM("print", "email"),
          allowNull: true,
          defaultValue: null,
        },
        receipt_sent_at: {
          type: DataTypes.DATE,
          allowNull: true,
          defaultValue: null,
        },
        status: {
          type: DataTypes.ENUM("completed", "voided"),
          allowNull: false,
          defaultValue: "completed",
        },
        void_reason: {
          type: DataTypes.TEXT,
          allowNull: true,
          defaultValue: null,
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        deleted_at: {
          type: DataTypes.DATE,
          allowNull: true,
          defaultValue: null,
        },
      },
      {
        sequelize,
        modelName: "PosTransaction",
        tableName: "sales_pos_transactions",
        timestamps: false,
        underscored: true,
      },
    );

    (PosTransactionModel as any).initialized = true;
  }
  return PosTransactionModel;
}

export default async function PosTransactionModelFactory() {
  return getPosTransactionModel();
}
