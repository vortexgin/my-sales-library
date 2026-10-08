import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type CustomerActivityType = "call" | "email" | "meeting" | "other";
export type CustomerActivityStatus = "active" | "inactive" | "deleted";

export type CustomerActivity = {
  uuid: string;
  organization_id: string | null;
  customer_id: string;
  type: CustomerActivityType;
  subject: string;
  body: string;
  occurred_at: string;
  attachment_url: string | null;
  status: CustomerActivityStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CreateCustomerActivityInput = {
  customer_id: string;
  type: CustomerActivityType;
  subject: string;
  body: string;
  occurred_at: string;
  attachment_url?: string | null;
  status?: CustomerActivityStatus;
};

export type UpdateCustomerActivityInput = Partial<CreateCustomerActivityInput>;

export type CustomerActivityModelAttributes = Partial<Omit<CustomerActivity, "created_at" | "updated_at" | "deleted_at" | "occurred_at">> & {
  occurred_at: Date;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type CustomerActivityModelCreationAttributes = Partial<CustomerActivityModelAttributes>;

export class CustomerActivityModel extends Model<CustomerActivityModelAttributes, CustomerActivityModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare customer_id: string;
  declare type: CustomerActivityType;
  declare subject: string;
  declare body: string;
  declare occurred_at: Date;
  declare attachment_url: string | null;
  declare status: CustomerActivityStatus;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): CustomerActivity {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      customer_id: row.customer_id,
      type: row.type,
      subject: row.subject,
      body: row.body,
      occurred_at: row.occurred_at ? new Date(row.occurred_at).toISOString() : new Date().toISOString(),
      attachment_url: row.attachment_url ?? null,
      status: row.status,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let customerActivityModelPromise: Promise<typeof CustomerActivityModel> | null = null;

export async function getCustomerActivityModel(): Promise<typeof CustomerActivityModel> {
  if ((CustomerActivityModel as any).initialized) {
    return CustomerActivityModel;
  }
  if (!customerActivityModelPromise) {
    customerActivityModelPromise = initCustomerActivityModel().catch((error) => {
      customerActivityModelPromise = null;
      throw error;
    });
  }
  return customerActivityModelPromise;
}

async function initCustomerActivityModel(): Promise<typeof CustomerActivityModel> {
  const sequelize = await getSequelizeInstance();

  {
    CustomerActivityModel.init(
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
        customer_id: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        type: {
          type: DataTypes.ENUM("call", "email", "meeting", "other"),
          allowNull: false,
        },
        subject: {
          type: DataTypes.STRING(200),
          allowNull: false,
        },
        body: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        occurred_at: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        attachment_url: {
          type: DataTypes.STRING(500),
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
        modelName: "CustomerActivity",
        tableName: "sales_customer_activities",
        timestamps: false,
        underscored: true,
      },
    );

    (CustomerActivityModel as any).initialized = true;
  }
  return CustomerActivityModel;
}

export default async function CustomerActivityModelFactory() {
  return getCustomerActivityModel();
}
