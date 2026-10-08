import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type CustomerMetadataStatus = "active" | "inactive" | "deleted";

export type CustomerMetadata = {
  uuid: string;
  customer_id: string;
  customer_metadata_field_id: string;
  value: string;
  status: CustomerMetadataStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CreateCustomerMetadataInput = {
  customer_id: string;
  customer_metadata_field_id: string;
  value: string;
  status?: CustomerMetadataStatus;
};

export type UpdateCustomerMetadataInput = Partial<CreateCustomerMetadataInput>;

export type CustomerMetadataModelAttributes = Partial<Omit<CustomerMetadata, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type CustomerMetadataModelCreationAttributes = Partial<CustomerMetadataModelAttributes>;

export class CustomerMetadataModel extends Model<CustomerMetadataModelAttributes, CustomerMetadataModelCreationAttributes> {
  declare uuid: string;
  declare customer_id: string;
  declare customer_metadata_field_id: string;
  declare value: string;
  declare status: CustomerMetadataStatus;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): CustomerMetadata {
    return {
      uuid: row.uuid,
      customer_id: row.customer_id,
      customer_metadata_field_id: row.customer_metadata_field_id,
      value: row.value,
      status: row.status,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let customerMetadataModelPromise: Promise<typeof CustomerMetadataModel> | null = null;

export async function getCustomerMetadataModel(): Promise<typeof CustomerMetadataModel> {
  if ((CustomerMetadataModel as any).initialized) {
    return CustomerMetadataModel;
  }
  if (!customerMetadataModelPromise) {
    customerMetadataModelPromise = initCustomerMetadataModel().catch((error) => {
      customerMetadataModelPromise = null;
      throw error;
    });
  }
  return customerMetadataModelPromise;
}

async function initCustomerMetadataModel(): Promise<typeof CustomerMetadataModel> {
  const sequelize = await getSequelizeInstance();

  {
    CustomerMetadataModel.init(
      {
        uuid: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        customer_id: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        customer_metadata_field_id: {
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
        modelName: "CustomerMetadata",
        tableName: "sales_customer_metadata",
        timestamps: false,
        underscored: true,
      },
    );

    (CustomerMetadataModel as any).initialized = true;
  }
  return CustomerMetadataModel;
}

export default async function CustomerMetadataModelFactory() {
  return getCustomerMetadataModel();
}
