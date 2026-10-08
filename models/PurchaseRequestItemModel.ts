import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type PurchaseRequestItemModelAttributes = {
  uuid: string;
  purchase_request_id: string;
  product_id: string;
  variant_id: string | null;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type PurchaseRequestItemModelCreationAttributes = Partial<PurchaseRequestItemModelAttributes>;

export class PurchaseRequestItemModel extends Model<PurchaseRequestItemModelAttributes, PurchaseRequestItemModelCreationAttributes> {
  declare uuid: string;
  declare purchase_request_id: string;
  declare product_id: string;
  declare variant_id: string | null;
  declare qty: number;
  declare unit_price: number;
  declare discount_pct: number;
  declare line_total: number;
  declare notes: string | null;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any) {
    return {
      uuid: row.uuid,
      purchase_request_id: row.purchase_request_id,
      product_id: row.product_id,
      variant_id: row.variant_id ?? null,
      qty: row.qty,
      unit_price: row.unit_price,
      discount_pct: typeof row.discount_pct === "number" ? row.discount_pct : 0,
      line_total: typeof row.line_total === "number" ? row.line_total : 0,
      notes: row.notes ?? null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }
}

let purchaseRequestItemModelPromise: Promise<typeof PurchaseRequestItemModel> | null = null;

export async function getPurchaseRequestItemModel(): Promise<typeof PurchaseRequestItemModel> {
  if ((PurchaseRequestItemModel as any).initialized) {
    return PurchaseRequestItemModel;
  }
  if (!purchaseRequestItemModelPromise) {
    purchaseRequestItemModelPromise = initPurchaseRequestItemModel().catch((error) => {
      purchaseRequestItemModelPromise = null;
      throw error;
    });
  }
  return purchaseRequestItemModelPromise;
}

async function initPurchaseRequestItemModel(): Promise<typeof PurchaseRequestItemModel> {
  const sequelize = await getSequelizeInstance();

  {
    PurchaseRequestItemModel.init(
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
        unit_price: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        discount_pct: {
          type: DataTypes.FLOAT,
          allowNull: false,
          defaultValue: 0,
        },
        line_total: {
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
        modelName: "PurchaseRequestItem",
        tableName: "sales_purchase_request_items",
        timestamps: false,
        underscored: true,
      },
    );

    (PurchaseRequestItemModel as any).initialized = true;
  }
  return PurchaseRequestItemModel;
}

export default async function PurchaseRequestItemModelFactory() {
  return getPurchaseRequestItemModel();
}
