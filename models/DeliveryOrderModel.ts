import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type DeliveryOrderStatus = "draft" | "packed" | "shipped" | "delivered" | "cancelled";
export type DeliveryOrderFulfillment = "system" | "paper";

export type DeliveryOrderItemInput = {
  product_id: string;
  variant_id?: string | null;
  qty: number;
};

export type DeliveryOrderItem = {
  uuid: string;
  delivery_order_id: string;
  product_id: string;
  variant_id: string | null;
  qty: number;
  /** Relation labels resolved in the Get useCase (UUID fallback on pages). Null when not loaded. */
  product_sku: string | null;
  product_name: string | null;
  variant_sku: string | null;
  variant_name: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type DeliveryOrderSalesOrder = {
  id: string;
  status: string;
};

export type DeliveryOrderWarehouse = {
  id: string;
  code: string;
  name: string;
};

export type DeliveryOrderCustomer = {
  id: string;
  name: string;
};

export type DeliveryOrder = {
  uuid: string;
  organization_id: string | null;
  doc_number: string | null;
  sales_order_id: string;
  warehouse_id: string;
  status: DeliveryOrderStatus;
  fulfillment: DeliveryOrderFulfillment | null;
  stock_deducted: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  items?: DeliveryOrderItem[];
  /** Relation labels come from eager-loaded associations, not stored snapshots. Null when absent. */
  sales_order: DeliveryOrderSalesOrder | null;
  warehouse: DeliveryOrderWarehouse | null;
  customer: DeliveryOrderCustomer | null;
};

export type CreateDeliveryOrderInput = {
  sales_order_id: string;
  warehouse_id: string;
  notes?: string | null;
  status?: DeliveryOrderStatus;
  items: DeliveryOrderItemInput[];
};

export type UpdateDeliveryOrderInput = {
  notes?: string | null;
  status?: DeliveryOrderStatus;
};

export type DeliveryOrderModelAttributes = Partial<Omit<DeliveryOrder, "created_at" | "updated_at" | "deleted_at" | "items" | "sales_order" | "warehouse" | "customer">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type DeliveryOrderModelCreationAttributes = Partial<DeliveryOrderModelAttributes>;

export class DeliveryOrderModel extends Model<DeliveryOrderModelAttributes, DeliveryOrderModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare doc_number: string | null;
  declare sales_order_id: string;
  declare warehouse_id: string;
  declare status: DeliveryOrderStatus;
  declare fulfillment: DeliveryOrderFulfillment | null;
  declare stock_deducted: boolean;
  declare notes: string | null;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): DeliveryOrder {
    const salesOrder = row.sales_order ?? null;
    const warehouse = row.warehouse ?? null;
    const customer = row.customer ?? null;
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      doc_number: row.doc_number ?? null,
      sales_order_id: row.sales_order_id,
      warehouse_id: row.warehouse_id,
      status: row.status,
      fulfillment: row.fulfillment ?? null,
      stock_deducted: Boolean(row.stock_deducted),
      notes: row.notes ?? null,
      sales_order: salesOrder ? { id: salesOrder.uuid ?? "", status: salesOrder.status ?? "" } : null,
      warehouse: warehouse
        ? { id: warehouse.uuid ?? "", code: warehouse.code ?? "", name: warehouse.name ?? "" }
        : null,
      customer: customer ? { id: customer.uuid ?? "", name: customer.name ?? "" } : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let deliveryOrderModelPromise: Promise<typeof DeliveryOrderModel> | null = null;

export async function getDeliveryOrderModel(): Promise<typeof DeliveryOrderModel> {
  if ((DeliveryOrderModel as any).initialized) {
    return DeliveryOrderModel;
  }
  if (!deliveryOrderModelPromise) {
    deliveryOrderModelPromise = initDeliveryOrderModel().catch((error) => {
      deliveryOrderModelPromise = null;
      throw error;
    });
  }
  return deliveryOrderModelPromise;
}

async function initDeliveryOrderModel(): Promise<typeof DeliveryOrderModel> {
  const sequelize = await getSequelizeInstance();

  {
    DeliveryOrderModel.init(
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
        sales_order_id: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        warehouse_id: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        status: {
          type: DataTypes.ENUM("draft", "packed", "shipped", "delivered", "cancelled"),
          allowNull: false,
          defaultValue: "draft",
        },
        fulfillment: {
          type: DataTypes.ENUM("system", "paper"),
          allowNull: true,
          defaultValue: null,
        },
        stock_deducted: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
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
        modelName: "DeliveryOrder",
        tableName: "sales_delivery_orders",
        timestamps: false,
        underscored: true,
      },
    );

    (DeliveryOrderModel as any).initialized = true;
  }
  return DeliveryOrderModel;
}

export default async function DeliveryOrderModelFactory() {
  return getDeliveryOrderModel();
}
