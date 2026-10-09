import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";
import type { PosTransactionItem } from "@/app/sales/models/PosTransactionModel";

export type PosTransactionItemModelAttributes = Partial<
  Omit<PosTransactionItem, "created_at" | "updated_at" | "deleted_at" | "product_sku" | "product_name" | "variant_sku" | "variant_name">
> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type PosTransactionItemModelCreationAttributes = Partial<PosTransactionItemModelAttributes>;

export class PosTransactionItemModel extends Model<PosTransactionItemModelAttributes, PosTransactionItemModelCreationAttributes> {
  declare uuid: string;
  declare transaction_id: string;
  declare product_id: string;
  declare variant_id: string | null;
  declare qty: number;
  declare unit_price: number;
  declare discount_pct: number;
  declare line_total: number;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(item: any): PosTransactionItem {
    return {
      uuid: item.uuid,
      transaction_id: item.transaction_id,
      product_id: item.product_id,
      variant_id: item.variant_id ?? null,
      qty: item.qty,
      unit_price: item.unit_price,
      discount_pct: typeof item.discount_pct === "number" ? item.discount_pct : 0,
      line_total: typeof item.line_total === "number" ? item.line_total : 0,
      product_sku: item.product_sku ?? null,
      product_name: item.product_name ?? null,
      variant_sku: item.variant_sku ?? null,
      variant_name: item.variant_name ?? null,
      created_at: item.created_at ? new Date(item.created_at).toISOString() : new Date().toISOString(),
      updated_at: item.updated_at ? new Date(item.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: item.deleted_at ? new Date(item.deleted_at).toISOString() : null,
    };
  }
}

let posTransactionItemModelPromise: Promise<typeof PosTransactionItemModel> | null = null;

export async function getPosTransactionItemModel(): Promise<typeof PosTransactionItemModel> {
  if ((PosTransactionItemModel as any).initialized) {
    return PosTransactionItemModel;
  }
  if (!posTransactionItemModelPromise) {
    posTransactionItemModelPromise = initPosTransactionItemModel().catch((error) => {
      posTransactionItemModelPromise = null;
      throw error;
    });
  }
  return posTransactionItemModelPromise;
}

async function initPosTransactionItemModel(): Promise<typeof PosTransactionItemModel> {
  const sequelize = await getSequelizeInstance();

  {
    PosTransactionItemModel.init(
      {
        uuid: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        transaction_id: {
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
        modelName: "PosTransactionItem",
        tableName: "sales_pos_transaction_items",
        timestamps: false,
        underscored: true,
      },
    );

    (PosTransactionItemModel as any).initialized = true;
  }
  return PosTransactionItemModel;
}

export default async function PosTransactionItemModelFactory() {
  return getPosTransactionItemModel();
}
