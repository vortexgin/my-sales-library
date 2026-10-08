import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type SalesOrderMetadataStatus = "active" | "inactive" | "deleted";

export type SalesOrderMetadata = {
  uuid: string;
  sales_order_id: string;
  sales_doc_metadata_field_id: string;
  value: string;
  status: SalesOrderMetadataStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CreateSalesOrderMetadataInput = {
  sales_order_id: string;
  sales_doc_metadata_field_id: string;
  value: string;
  status?: SalesOrderMetadataStatus;
};

export type UpdateSalesOrderMetadataInput = Partial<CreateSalesOrderMetadataInput>;

export type SalesOrderMetadataModelAttributes = Partial<Omit<SalesOrderMetadata, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type SalesOrderMetadataModelCreationAttributes = Partial<SalesOrderMetadataModelAttributes>;

export class SalesOrderMetadataModel extends Model<SalesOrderMetadataModelAttributes, SalesOrderMetadataModelCreationAttributes> {
  declare uuid: string;
  declare sales_order_id: string;
  declare sales_doc_metadata_field_id: string;
  declare value: string;
  declare status: SalesOrderMetadataStatus;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): SalesOrderMetadata {
    return {
      uuid: row.uuid,
      sales_order_id: row.sales_order_id,
      sales_doc_metadata_field_id: row.sales_doc_metadata_field_id,
      value: row.value,
      status: row.status,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let salesOrderMetadataModelPromise: Promise<typeof SalesOrderMetadataModel> | null = null;

export async function getSalesOrderMetadataModel(): Promise<typeof SalesOrderMetadataModel> {
  if ((SalesOrderMetadataModel as any).initialized) {
    return SalesOrderMetadataModel;
  }
  if (!salesOrderMetadataModelPromise) {
    salesOrderMetadataModelPromise = initSalesOrderMetadataModel().catch((error) => {
      salesOrderMetadataModelPromise = null;
      throw error;
    });
  }
  return salesOrderMetadataModelPromise;
}

async function initSalesOrderMetadataModel(): Promise<typeof SalesOrderMetadataModel> {
  const sequelize = await getSequelizeInstance();

  {
    SalesOrderMetadataModel.init(
      {
        uuid: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        sales_order_id: {
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
        modelName: "SalesOrderMetadata",
        tableName: "sales_order_metadata",
        timestamps: false,
        underscored: true,
      },
    );

    (SalesOrderMetadataModel as any).initialized = true;
  }
  return SalesOrderMetadataModel;
}

export default async function SalesOrderMetadataModelFactory() {
  return getSalesOrderMetadataModel();
}
