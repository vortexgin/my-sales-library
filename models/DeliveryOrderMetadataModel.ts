import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type DeliveryOrderMetadataStatus = "active" | "inactive" | "deleted";

export type DeliveryOrderMetadata = {
  uuid: string;
  sales_delivery_order_id: string;
  sales_doc_metadata_field_id: string;
  value: string;
  status: DeliveryOrderMetadataStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CreateDeliveryOrderMetadataInput = {
  sales_delivery_order_id: string;
  sales_doc_metadata_field_id: string;
  value: string;
  status?: DeliveryOrderMetadataStatus;
};

export type UpdateDeliveryOrderMetadataInput = Partial<CreateDeliveryOrderMetadataInput>;

export type DeliveryOrderMetadataModelAttributes = Partial<Omit<DeliveryOrderMetadata, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type DeliveryOrderMetadataModelCreationAttributes = Partial<DeliveryOrderMetadataModelAttributes>;

export class DeliveryOrderMetadataModel extends Model<DeliveryOrderMetadataModelAttributes, DeliveryOrderMetadataModelCreationAttributes> {
  declare uuid: string;
  declare sales_delivery_order_id: string;
  declare sales_doc_metadata_field_id: string;
  declare value: string;
  declare status: DeliveryOrderMetadataStatus;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): DeliveryOrderMetadata {
    return {
      uuid: row.uuid,
      sales_delivery_order_id: row.sales_delivery_order_id,
      sales_doc_metadata_field_id: row.sales_doc_metadata_field_id,
      value: row.value,
      status: row.status,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let deliveryOrderMetadataModelPromise: Promise<typeof DeliveryOrderMetadataModel> | null = null;

export async function getDeliveryOrderMetadataModel(): Promise<typeof DeliveryOrderMetadataModel> {
  if ((DeliveryOrderMetadataModel as any).initialized) {
    return DeliveryOrderMetadataModel;
  }
  if (!deliveryOrderMetadataModelPromise) {
    deliveryOrderMetadataModelPromise = initDeliveryOrderMetadataModel().catch((error) => {
      deliveryOrderMetadataModelPromise = null;
      throw error;
    });
  }
  return deliveryOrderMetadataModelPromise;
}

async function initDeliveryOrderMetadataModel(): Promise<typeof DeliveryOrderMetadataModel> {
  const sequelize = await getSequelizeInstance();

  {
    DeliveryOrderMetadataModel.init(
      {
        uuid: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        sales_delivery_order_id: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        sales_doc_metadata_field_id: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        value: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        status: {
          type: DataTypes.ENUM("active", "inactive", "deleted"),
          allowNull: false,
          defaultValue: "active",
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
        modelName: "DeliveryOrderMetadata",
        tableName: "sales_delivery_order_metadata",
        timestamps: false,
        underscored: true,
      },
    );

    (DeliveryOrderMetadataModel as any).initialized = true;
  }
  return DeliveryOrderMetadataModel;
}

export default async function DeliveryOrderMetadataModelFactory() {
  return getDeliveryOrderMetadataModel();
}
