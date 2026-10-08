import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type DeliveryOrderItemModelAttributes = {
  uuid: string;
  delivery_order_id: string;
  product_id: string;
  variant_id: string | null;
  qty: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type DeliveryOrderItemModelCreationAttributes = Partial<DeliveryOrderItemModelAttributes>;

export class DeliveryOrderItemModel extends Model<DeliveryOrderItemModelAttributes, DeliveryOrderItemModelCreationAttributes> {
  declare uuid: string;
  declare delivery_order_id: string;
  declare product_id: string;
  declare variant_id: string | null;
  declare qty: number;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any) {
    return {
      uuid: row.uuid,
      delivery_order_id: row.delivery_order_id,
      product_id: row.product_id,
      variant_id: row.variant_id ?? null,
      qty: row.qty,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let deliveryOrderItemModelPromise: Promise<typeof DeliveryOrderItemModel> | null = null;

export async function getDeliveryOrderItemModel(): Promise<typeof DeliveryOrderItemModel> {
  if ((DeliveryOrderItemModel as any).initialized) {
    return DeliveryOrderItemModel;
  }
  if (!deliveryOrderItemModelPromise) {
    deliveryOrderItemModelPromise = initDeliveryOrderItemModel().catch((error) => {
      deliveryOrderItemModelPromise = null;
      throw error;
    });
  }
  return deliveryOrderItemModelPromise;
}

async function initDeliveryOrderItemModel(): Promise<typeof DeliveryOrderItemModel> {
  const sequelize = await getSequelizeInstance();

  {
    DeliveryOrderItemModel.init(
      {
        uuid: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        delivery_order_id: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        product_id: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        variant_id: {
          type: DataTypes.UUID,
          allowNull: true,
          defaultValue: null,
        },
        qty: {
          type: DataTypes.INTEGER,
          allowNull: false,
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
        modelName: "DeliveryOrderItem",
        tableName: "sales_delivery_order_items",
        timestamps: false,
        underscored: true,
      },
    );

    (DeliveryOrderItemModel as any).initialized = true;
  }
  return DeliveryOrderItemModel;
}

export default async function DeliveryOrderItemModelFactory() {
  return getDeliveryOrderItemModel();
}
