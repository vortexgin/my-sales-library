import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";
import type { SalesOrderMetadata } from "@/app/sales/models/SalesOrderMetadataModel";

export type SalesOrderStatus = "draft" | "confirmed" | "paid" | "shipped" | "cancelled";

export type SalesOrderItemInput = {
  product_id: string;
  variant_id?: string | null;
  qty: number;
  unit_price: number;
  discount_pct?: number;
  notes?: string | null;
};

export type SalesOrderItem = {
  uuid: string;
  sales_order_id: string;
  product_id: string;
  variant_id: string | null;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
  notes: string | null;
  /** Relation labels resolved in the Get useCase (UUID fallback on pages). Null when not loaded. */
  product_sku: string | null;
  product_name: string | null;
  variant_sku: string | null;
  variant_name: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SalesOrderCustomer = {
  id: string;
  name: string;
};

export type SalesOrderWarehouse = {
  id: string;
  code: string;
  name: string;
};

export type SalesOrderPurchaseRequest = {
  id: string;
  status: string;
};

export type SalesOrder = {
  uuid: string;
  organization_id: string | null;
  doc_number: string | null;
  customer_id: string;
  purchase_request_id: string | null;
  warehouse_id: string | null;
  status: SalesOrderStatus;
  subtotal: number;
  discount_pct: number;
  grand_total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  items?: SalesOrderItem[];
  metadata?: Array<SalesOrderMetadata & { field_name?: string }>;
  /** Relation labels come from eager-loaded associations, not stored snapshots. Null when absent. */
  customer: SalesOrderCustomer | null;
  warehouse: SalesOrderWarehouse | null;
  purchase_request: SalesOrderPurchaseRequest | null;
};

export type CreateSalesOrderInput = {
  customer_id: string;
  purchase_request_id?: string | null;
  warehouse_id?: string | null;
  discount_pct?: number;
  notes?: string | null;
  status?: SalesOrderStatus;
  items: SalesOrderItemInput[];
  metadata?: Array<{
    uuid?: string;
    sales_doc_metadata_field_id?: string;
    field_name?: string;
    value: string;
  }>;
};

export type UpdateSalesOrderInput = {
  warehouse_id?: string | null;
  discount_pct?: number;
  notes?: string | null;
  status?: SalesOrderStatus;
  metadata?: Array<{
    uuid?: string;
    sales_doc_metadata_field_id?: string;
    field_name?: string;
    value: string;
  }>;
};

export type SalesOrderModelAttributes = Partial<Omit<SalesOrder, "created_at" | "updated_at" | "deleted_at" | "items" | "metadata" | "customer" | "warehouse" | "purchase_request">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type SalesOrderModelCreationAttributes = Partial<SalesOrderModelAttributes>;

export class SalesOrderModel extends Model<SalesOrderModelAttributes, SalesOrderModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare doc_number: string | null;
  declare customer_id: string;
  declare purchase_request_id: string | null;
  declare warehouse_id: string | null;
  declare status: SalesOrderStatus;
  declare subtotal: number;
  declare discount_pct: number;
  declare grand_total: number;
  declare notes: string | null;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): SalesOrder {
    const customer = row.customer ?? null;
    const warehouse = row.warehouse ?? null;
    const purchaseRequest = row.purchase_request ?? null;
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      doc_number: row.doc_number ?? null,
      customer_id: row.customer_id,
      purchase_request_id: row.purchase_request_id ?? null,
      warehouse_id: row.warehouse_id ?? null,
      status: row.status,
      subtotal: typeof row.subtotal === "number" ? row.subtotal : 0,
      discount_pct: typeof row.discount_pct === "number" ? row.discount_pct : 0,
      grand_total: typeof row.grand_total === "number" ? row.grand_total : 0,
      notes: row.notes ?? null,
      customer: customer ? { id: customer.uuid ?? "", name: customer.name ?? "" } : null,
      warehouse: warehouse
        ? { id: warehouse.uuid ?? "", code: warehouse.code ?? "", name: warehouse.name ?? "" }
        : null,
      purchase_request: purchaseRequest
        ? { id: purchaseRequest.uuid ?? "", status: purchaseRequest.status ?? "" }
        : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }

  /** Server snapshot math (% discounts only, rounded, never recomputed on read). */
  static lineTotal(qty: number, unitPrice: number, discountPct: number): number {
    return Math.round(qty * unitPrice * (1 - discountPct / 100));
  }

  static grandTotal(subtotal: number, discountPct: number): number {
    return Math.round(subtotal * (1 - discountPct / 100));
  }
}

let salesOrderModelPromise: Promise<typeof SalesOrderModel> | null = null;

export async function getSalesOrderModel(): Promise<typeof SalesOrderModel> {
  if ((SalesOrderModel as any).initialized) {
    return SalesOrderModel;
  }
  if (!salesOrderModelPromise) {
    salesOrderModelPromise = initSalesOrderModel().catch((error) => {
      salesOrderModelPromise = null;
      throw error;
    });
  }
  return salesOrderModelPromise;
}

async function initSalesOrderModel(): Promise<typeof SalesOrderModel> {
  const sequelize = await getSequelizeInstance();

  {
    SalesOrderModel.init(
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
        doc_number: {
          type: DataTypes.STRING(40),
          allowNull: true,
          defaultValue: null,
        },
        customer_id: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        purchase_request_id: {
          type: DataTypes.UUID,
          allowNull: true,
          defaultValue: null,
        },
        warehouse_id: {
          type: DataTypes.UUID,
          allowNull: true,
          defaultValue: null,
        },
        status: {
          type: DataTypes.ENUM("draft", "confirmed", "paid", "shipped", "cancelled"),
          allowNull: false,
          defaultValue: "draft",
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
        notes: {
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
        modelName: "SalesOrder",
        tableName: "sales_orders",
        timestamps: false,
        underscored: true,
      },
    );

    (SalesOrderModel as any).initialized = true;
  }
  return SalesOrderModel;
}

export default async function SalesOrderModelFactory() {
  return getSalesOrderModel();
}
