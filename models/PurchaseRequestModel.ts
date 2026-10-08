import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type PurchaseRequestStatus = "draft" | "submitted" | "approved" | "rejected" | "closed";

export type PurchaseRequestItemInput = {
  product_id: string;
  variant_id?: string | null;
  qty: number;
  unit_price: number;
  discount_pct?: number;
  notes?: string | null;
};

export type PurchaseRequestItem = {
  uuid: string;
  purchase_request_id: string;
  product_id: string;
  variant_id: string | null;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PurchaseRequest = {
  uuid: string;
  organization_id: string | null;
  customer_id: string;
  warehouse_id: string | null;
  status: PurchaseRequestStatus;
  subtotal: number;
  discount_pct: number;
  grand_total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  items?: PurchaseRequestItem[];
};

export type CreatePurchaseRequestInput = {
  customer_id: string;
  warehouse_id?: string | null;
  discount_pct?: number;
  notes?: string | null;
  status?: PurchaseRequestStatus;
  items: PurchaseRequestItemInput[];
};

export type UpdatePurchaseRequestInput = {
  warehouse_id?: string | null;
  discount_pct?: number;
  notes?: string | null;
  status?: PurchaseRequestStatus;
};

export type PurchaseRequestModelAttributes = Partial<Omit<PurchaseRequest, "created_at" | "updated_at" | "deleted_at" | "items">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type PurchaseRequestModelCreationAttributes = Partial<PurchaseRequestModelAttributes>;

export class PurchaseRequestModel extends Model<PurchaseRequestModelAttributes, PurchaseRequestModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare customer_id: string;
  declare warehouse_id: string | null;
  declare status: PurchaseRequestStatus;
  declare subtotal: number;
  declare discount_pct: number;
  declare grand_total: number;
  declare notes: string | null;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(row: any): PurchaseRequest {
    return {
      uuid: row.uuid,
      organization_id: row.organization_id ?? null,
      customer_id: row.customer_id,
      warehouse_id: row.warehouse_id ?? null,
      status: row.status,
      subtotal: typeof row.subtotal === "number" ? row.subtotal : 0,
      discount_pct: typeof row.discount_pct === "number" ? row.discount_pct : 0,
      grand_total: typeof row.grand_total === "number" ? row.grand_total : 0,
      notes: row.notes ?? null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    };
  }

  /** Server snapshot math (% discounts only, rounded, never recomputed on read). */
  static lineTotal(qty: number, unitPrice: number, discountPct: number): number {
    return Math.round(qty * unitPrice * (1 - discountPct / 100));
  }

  static grandTotal(subtotal: number, discountPct: number): number {
    return Math.round(subtotal * (1 - discountPct / 100));
  }
}

let purchaseRequestModelPromise: Promise<typeof PurchaseRequestModel> | null = null;

export async function getPurchaseRequestModel(): Promise<typeof PurchaseRequestModel> {
  if ((PurchaseRequestModel as any).initialized) {
    return PurchaseRequestModel;
  }
  if (!purchaseRequestModelPromise) {
    purchaseRequestModelPromise = initPurchaseRequestModel().catch((error) => {
      purchaseRequestModelPromise = null;
      throw error;
    });
  }
  return purchaseRequestModelPromise;
}

async function initPurchaseRequestModel(): Promise<typeof PurchaseRequestModel> {
  const sequelize = await getSequelizeInstance();

  {
    PurchaseRequestModel.init(
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
        warehouse_id: {
          type: DataTypes.UUID,
          allowNull: true,
          defaultValue: null,
        },
        status: {
          type: DataTypes.ENUM("draft", "submitted", "approved", "rejected", "closed"),
          allowNull: false,
          defaultValue: "draft",
        },
        subtotal: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        discount_pct: {
          type: DataTypes.FLOAT,
          allowNull: false,
          defaultValue: 0,
        },
        grand_total: {
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
        modelName: "PurchaseRequest",
        tableName: "sales_purchase_requests",
        timestamps: false,
        underscored: true,
      },
    );

    (PurchaseRequestModel as any).initialized = true;
  }
  return PurchaseRequestModel;
}

export default async function PurchaseRequestModelFactory() {
  return getPurchaseRequestModel();
}
