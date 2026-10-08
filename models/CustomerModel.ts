import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type CustomerStatus = "active" | "inactive" | "deleted";

export type Customer = {
  uuid: string;
  organization_id: string | null;
  lead_id: string | null;
  name: string;
  email: string;
  phone: string;
  company_name: string | null;
  notes: string | null;
  status: CustomerStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CustomerMetadataNestedInput = {
  uuid?: string;
  customer_metadata_field_id?: string;
  field_name?: string;
  value: string;
};

export type CreateCustomerInput = {
  name: string;
  email: string;
  phone: string;
  company_name?: string | null;
  notes?: string | null;
  status?: CustomerStatus;
  metadata?: CustomerMetadataNestedInput[];
};

export type UpdateCustomerInput = Partial<CreateCustomerInput>;

export type CustomerModelAttributes = Partial<Omit<Customer, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type CustomerModelCreationAttributes = Partial<CustomerModelAttributes>;

export class CustomerModel extends Model<CustomerModelAttributes, CustomerModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare lead_id: string | null;
  declare name: string;
  declare email: string;
  declare phone: string;
  declare company_name: string | null;
  declare notes: string | null;
  declare status: CustomerStatus;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(customer: any): Customer {
    return {
      uuid: customer.uuid,
      organization_id: customer.organization_id ?? null,
      lead_id: customer.lead_id ?? null,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      company_name: customer.company_name ?? null,
      notes: customer.notes ?? null,
      status: customer.status,
      created_at: customer.created_at ? new Date(customer.created_at).toISOString() : new Date().toISOString(),
      updated_at: customer.updated_at ? new Date(customer.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: customer.deleted_at ? new Date(customer.deleted_at).toISOString() : null,
    };
  }
}

let customerModelPromise: Promise<typeof CustomerModel> | null = null;

export async function getCustomerModel(): Promise<typeof CustomerModel> {
  if ((CustomerModel as any).initialized) {
    return CustomerModel;
  }
  if (!customerModelPromise) {
    customerModelPromise = initCustomerModel().catch((error) => {
      customerModelPromise = null;
      throw error;
    });
  }
  return customerModelPromise;
}

async function initCustomerModel(): Promise<typeof CustomerModel> {
  const sequelize = await getSequelizeInstance();

  {
    CustomerModel.init(
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
        lead_id: {
          type: DataTypes.UUID,
          allowNull: true,
          defaultValue: null,
        },
        name: {
          type: DataTypes.STRING(160),
          allowNull: false,
        },
        email: {
          type: DataTypes.STRING(160),
          allowNull: false,
        },
        phone: {
          type: DataTypes.STRING(30),
          allowNull: false,
        },
        company_name: {
          type: DataTypes.STRING(160),
          allowNull: true,
          defaultValue: null,
        },
        notes: {
          type: DataTypes.TEXT,
          allowNull: true,
          defaultValue: null,
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
        modelName: "Customer",
        tableName: "sales_customers",
        timestamps: false,
        underscored: true,
      },
    );

    (CustomerModel as any).initialized = true;
  }
  return CustomerModel;
}

export default async function CustomerModelFactory() {
  return getCustomerModel();
}
