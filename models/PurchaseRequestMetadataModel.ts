import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type PurchaseRequestMetadataStatus = "active" | "inactive" | "deleted";

export type PurchaseRequestMetadata = {
  uuid: string;
  purchase_request_id: string;
  sales_doc_metadata_field_id: string;
  /** Populated by parent/detail reads; UUID fallback is used when unavailable. */
  field_name?: string;
  value: string;
  status: PurchaseRequestMetadataStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CreatePurchaseRequestMetadataInput = {
  purchase_request_id: string;
  sales_doc_metadata_field_id: string;
  value: string;
  status?: PurchaseRequestMetadataStatus;
};

export type UpdatePurchaseRequestMetadataInput = Partial<CreatePurchaseRequestMetadataInput>;

export type PurchaseRequestMetadataModelAttributes = Partial<Omit<PurchaseRequestMetadata, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type PurchaseRequestMetadataModelCreationAttributes = Partial<PurchaseRequestMetadataModelAttributes>;

export class PurchaseRequestMetadataModel extends Model<PurchaseRequestMetadataModelAttributes, PurchaseRequestMetadataModelCreationAttributes> {
  declare uuid: string;
  declare purchase_request_id: string;
  declare sales_doc_metadata_field_id: string;
  declare value: string;
  declare status: PurchaseRequestMetadataStatus;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): PurchaseRequestMetadata {
    return {
      uuid: row.uuid,
      purchase_request_id: row.purchase_request_id,
      sales_doc_metadata_field_id: row.sales_doc_metadata_field_id,
      value: row.value,
      status: row.status,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let purchaseRequestMetadataModelPromise: Promise<typeof PurchaseRequestMetadataModel> | null = null;

export async function getPurchaseRequestMetadataModel(): Promise<typeof PurchaseRequestMetadataModel> {
  if ((PurchaseRequestMetadataModel as any).initialized) {
    return PurchaseRequestMetadataModel;
  }
  if (!purchaseRequestMetadataModelPromise) {
    purchaseRequestMetadataModelPromise = initPurchaseRequestMetadataModel().catch((error) => {
      purchaseRequestMetadataModelPromise = null;
      throw error;
    });
  }
  return purchaseRequestMetadataModelPromise;
}

async function initPurchaseRequestMetadataModel(): Promise<typeof PurchaseRequestMetadataModel> {
  const sequelize = await getSequelizeInstance();

  {
    PurchaseRequestMetadataModel.init(
      {
        uuid: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        purchase_request_id: {
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
        modelName: "PurchaseRequestMetadata",
        tableName: "sales_purchase_request_metadata",
        timestamps: false,
        underscored: true,
      },
    );

    (PurchaseRequestMetadataModel as any).initialized = true;
  }
  return PurchaseRequestMetadataModel;
}

export default async function PurchaseRequestMetadataModelFactory() {
  return getPurchaseRequestMetadataModel();
}
