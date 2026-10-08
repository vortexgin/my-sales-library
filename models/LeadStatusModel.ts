import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type LeadStatusState = "active" | "inactive" | "deleted";

export type LeadStatus = {
  uuid: string;
  organization_id: string | null;
  name: string;
  description: string;
  weight: number;
  is_final: boolean;
  status: LeadStatusState;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CreateLeadStatusInput = {
  name: string;
  description: string;
  weight?: number;
  is_final?: boolean;
  status?: LeadStatusState;
};

export type UpdateLeadStatusInput = Partial<CreateLeadStatusInput>;

export type LeadStatusModelAttributes = Partial<Omit<LeadStatus, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type LeadStatusModelCreationAttributes = Partial<LeadStatusModelAttributes>;

export class LeadStatusModel extends Model<LeadStatusModelAttributes, LeadStatusModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare name: string;
  declare description: string;
  declare weight: number;
  declare is_final: boolean;
  declare status: LeadStatusState;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(leadStatus: any): LeadStatus {
    return {
      uuid: leadStatus.uuid,
      organization_id: leadStatus.organization_id ?? null,
      name: leadStatus.name,
      description: leadStatus.description,
      weight: typeof leadStatus.weight === "number" ? leadStatus.weight : 0,
      is_final: Boolean(leadStatus.is_final),
      status: leadStatus.status,
      created_at: leadStatus.created_at ? new Date(leadStatus.created_at).toISOString() : new Date().toISOString(),
      updated_at: leadStatus.updated_at ? new Date(leadStatus.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: leadStatus.deleted_at ? new Date(leadStatus.deleted_at).toISOString() : null,
    };
  }

  /**
   * Start of the pipeline: lowest weight, oldest first, among active rows
   * for the organization. Falls back to "new" when none is configured.
   */
  static async resolveStartName(organizationId: string | null): Promise<string> {
    await getLeadStatusModel();
    const row = await LeadStatusModel.findOne({
      where: { organization_id: organizationId, status: "active", deleted_at: null },
      order: [["weight", "ASC"], ["created_at", "ASC"]],
    });
    return row?.name ?? "new";
  }

  /**
   * First final stage by weight for the organization, if one is configured.
   */
  static async resolveFinalName(organizationId: string | null): Promise<string | null> {
    await getLeadStatusModel();
    const row = await LeadStatusModel.findOne({
      where: { organization_id: organizationId, is_final: true, status: "active", deleted_at: null },
      order: [["weight", "ASC"], ["created_at", "ASC"]],
    });
    return row?.name ?? null;
  }
}

let leadStatusModelPromise: Promise<typeof LeadStatusModel> | null = null;

export async function getLeadStatusModel(): Promise<typeof LeadStatusModel> {
  if ((LeadStatusModel as any).initialized) {
    return LeadStatusModel;
  }
  if (!leadStatusModelPromise) {
    leadStatusModelPromise = initLeadStatusModel().catch((error) => {
      leadStatusModelPromise = null;
      throw error;
    });
  }
  return leadStatusModelPromise;
}

async function initLeadStatusModel(): Promise<typeof LeadStatusModel> {
  const sequelize = await getSequelizeInstance();

  {
    LeadStatusModel.init(
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
        weight: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        is_final: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
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
        modelName: "LeadStatus",
        tableName: "sales_lead_statuses",
        timestamps: false,
        underscored: true,
      },
    );

    (LeadStatusModel as any).initialized = true;
  }
  return LeadStatusModel;
}

export default async function LeadStatusModelFactory() {
  return getLeadStatusModel();
}
