import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type PosSessionStatus = "open" | "closed" | "auto_closed";

export type PosSession = {
  uuid: string;
  organization_id: string | null;
  opened_by: string;
  opened_at: string;
  closed_at: string | null;
  status: PosSessionStatus;
  opening_cash: number;
  closing_cash: number | null;
  closing_note: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type OpenPosSessionInput = {
  opening_cash?: number;
  notes?: string | null;
};

export type ClosePosSessionInput = {
  closing_cash?: number | null;
  closing_note?: string | null;
  force?: boolean;
};

export type PosSessionModelAttributes = Partial<Omit<PosSession, "created_at" | "updated_at" | "deleted_at" | "opened_at" | "closed_at">> & {
  opened_at: Date;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type PosSessionModelCreationAttributes = Partial<PosSessionModelAttributes>;

export class PosSessionModel extends Model<PosSessionModelAttributes, PosSessionModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare opened_by: string;
  declare opened_at: Date;
  declare closed_at: Date | null;
  declare status: PosSessionStatus;
  declare opening_cash: number;
  declare closing_cash: number | null;
  declare closing_note: string | null;
  declare notes: string | null;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(session: any): PosSession {
    return {
      uuid: session.uuid,
      organization_id: session.organization_id ?? null,
      opened_by: session.opened_by,
      opened_at: session.opened_at ? new Date(session.opened_at).toISOString() : new Date().toISOString(),
      closed_at: session.closed_at ? new Date(session.closed_at).toISOString() : null,
      status: session.status,
      opening_cash: typeof session.opening_cash === "number" ? session.opening_cash : 0,
      closing_cash: typeof session.closing_cash === "number" ? session.closing_cash : null,
      closing_note: session.closing_note ?? null,
      notes: session.notes ?? null,
      created_at: session.created_at ? new Date(session.created_at).toISOString() : new Date().toISOString(),
      updated_at: session.updated_at ? new Date(session.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: session.deleted_at ? new Date(session.deleted_at).toISOString() : null,
    };
  }

  /** Today's midnight boundary in server local time for stale-shift detection. */
  static startOfToday(): Date {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return midnight;
  }
}

let posSessionModelPromise: Promise<typeof PosSessionModel> | null = null;

export async function getPosSessionModel(): Promise<typeof PosSessionModel> {
  if ((PosSessionModel as any).initialized) {
    return PosSessionModel;
  }
  if (!posSessionModelPromise) {
    posSessionModelPromise = initPosSessionModel().catch((error) => {
      posSessionModelPromise = null;
      throw error;
    });
  }
  return posSessionModelPromise;
}

async function initPosSessionModel(): Promise<typeof PosSessionModel> {
  const sequelize = await getSequelizeInstance();

  {
    PosSessionModel.init(
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
        opened_by: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        opened_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        closed_at: {
          type: DataTypes.DATE,
          allowNull: true,
          defaultValue: null,
        },
        status: {
          type: DataTypes.ENUM("open", "closed", "auto_closed"),
          allowNull: false,
          defaultValue: "open",
        },
        opening_cash: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        closing_cash: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: null,
        },
        closing_note: {
          type: DataTypes.TEXT,
          allowNull: true,
          defaultValue: null,
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
        modelName: "PosSession",
        tableName: "sales_pos_sessions",
        timestamps: false,
        underscored: true,
      },
    );

    (PosSessionModel as any).initialized = true;
  }
  return PosSessionModel;
}

export default async function PosSessionModelFactory() {
  return getPosSessionModel();
}
