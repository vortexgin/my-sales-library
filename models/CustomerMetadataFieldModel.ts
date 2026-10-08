import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type CustomerMetadataFieldState = "active" | "inactive" | "deleted";

export type CustomerMetadataField = {
  uuid: string;
  organization_id: string | null;
  name: string;
  description: string;
  status: CustomerMetadataFieldState;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CreateCustomerMetadataFieldInput = {
  name: string;
  description: string;
  status?: CustomerMetadataFieldState;
};

export type UpdateCustomerMetadataFieldInput = Partial<CreateCustomerMetadataFieldInput>;

export type CustomerMetadataFieldModelAttributes = Partial<Omit<CustomerMetadataField, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type CustomerMetadataFieldModelCreationAttributes = Partial<CustomerMetadataFieldModelAttributes>;

export class CustomerMetadataFieldModel extends Model<CustomerMetadataFieldModelAttributes, CustomerMetadataFieldModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare name: string;
  declare description: string;
  declare status: CustomerMetadataFieldState;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(field: any): CustomerMetadataField {
    return {
      uuid: field.uuid,
      organization_id: field.organization_id ?? null,
      name: field.name,
      description: field.description,
      status: field.status,
      created_at: field.created_at ? new Date(field.created_at).toISOString() : new Date().toISOString(),
      updated_at: field.updated_at ? new Date(field.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: field.deleted_at ? new Date(field.deleted_at).toISOString() : null,
    };
  }
}

let customerMetadataFieldModelPromise: Promise<typeof CustomerMetadataFieldModel> | null = null;

export async function getCustomerMetadataFieldModel(): Promise<typeof CustomerMetadataFieldModel> {
  if ((CustomerMetadataFieldModel as any).initialized) {
    return CustomerMetadataFieldModel;
  }
  if (!customerMetadataFieldModelPromise) {
    customerMetadataFieldModelPromise = initCustomerMetadataFieldModel().catch((error) => {
      customerMetadataFieldModelPromise = null;
      throw error;
    });
  }
  return customerMetadataFieldModelPromise;
}

async function initCustomerMetadataFieldModel(): Promise<typeof CustomerMetadataFieldModel> {
  const sequelize = await getSequelizeInstance();

  {
    CustomerMetadataFieldModel.init(
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
        name: {
          type: DataTypes.STRING(160),
          allowNull: false,
        },
        description: {
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
        modelName: "CustomerMetadataField",
        tableName: "sales_customer_metadata_fields",
        timestamps: false,
        underscored: true,
      },
    );

    (CustomerMetadataFieldModel as any).initialized = true;
  }
  return CustomerMetadataFieldModel;
}

export default async function CustomerMetadataFieldModelFactory() {
  return getCustomerMetadataFieldModel();
}
