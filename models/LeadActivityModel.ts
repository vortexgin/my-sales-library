import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type LeadActivityState = "active" | "inactive" | "deleted";

export type LeadActivity = {
  uuid: string;
  leads_id: string;
  pic: string;
  phone: string;
  email: string;
  meeting_start: string;
  meeting_end: string | null;
  notes: string;
  attachment: string | null;
  status: LeadActivityState;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CreateLeadActivityInput = {
  leads_id: string;
  pic: string;
  phone: string;
  email: string;
  meeting_start: string;
  meeting_end?: string | null;
  notes: string;
  attachment?: string | null;
  status?: LeadActivityState;
};

export type UpdateLeadActivityInput = Partial<CreateLeadActivityInput>;

export type LeadActivityModelAttributes = Partial<Omit<LeadActivity, "created_at" | "updated_at" | "deleted_at" | "meeting_start" | "meeting_end">> & {
  meeting_start: Date;
  meeting_end: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type LeadActivityModelCreationAttributes = Partial<LeadActivityModelAttributes>;

export class LeadActivityModel extends Model<LeadActivityModelAttributes, LeadActivityModelCreationAttributes> {
  declare uuid: string;
  declare leads_id: string;
  declare pic: string;
  declare phone: string;
  declare email: string;
  declare meeting_start: Date;
  declare meeting_end: Date | null;
  declare notes: string;
  declare attachment: string | null;
  declare status: LeadActivityState;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(leadActivity: any): LeadActivity {
    return {
      uuid: leadActivity.uuid,
      leads_id: leadActivity.leads_id,
      pic: leadActivity.pic,
      phone: leadActivity.phone,
      email: leadActivity.email,
      meeting_start: leadActivity.meeting_start ? new Date(leadActivity.meeting_start).toISOString() : new Date().toISOString(),
      meeting_end: leadActivity.meeting_end ? new Date(leadActivity.meeting_end).toISOString() : null,
      notes: leadActivity.notes,
      attachment: leadActivity.attachment ?? null,
      status: leadActivity.status,
      created_at: leadActivity.created_at ? new Date(leadActivity.created_at).toISOString() : new Date().toISOString(),
      updated_at: leadActivity.updated_at ? new Date(leadActivity.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: leadActivity.deleted_at ? new Date(leadActivity.deleted_at).toISOString() : null,
    };
  }
}

let leadActivityModelPromise: Promise<typeof LeadActivityModel> | null = null;

export async function getLeadActivityModel(): Promise<typeof LeadActivityModel> {
  if ((LeadActivityModel as any).initialized) {
    return LeadActivityModel;
  }
  if (!leadActivityModelPromise) {
    leadActivityModelPromise = initLeadActivityModel().catch((error) => {
      leadActivityModelPromise = null;
      throw error;
    });
  }
  return leadActivityModelPromise;
}

async function initLeadActivityModel(): Promise<typeof LeadActivityModel> {
  const sequelize = await getSequelizeInstance();

  {
    LeadActivityModel.init(
      {
        uuid: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        leads_id: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        pic: {
          type: DataTypes.STRING(120),
          allowNull: false,
        },
        phone: {
          type: DataTypes.STRING(30),
          allowNull: false,
        },
        email: {
          type: DataTypes.STRING(160),
          allowNull: false,
          validate: {
            isEmail: true,
          },
        },
        meeting_start: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        meeting_end: {
          type: DataTypes.DATE,
          allowNull: true,
          defaultValue: null,
        },
        notes: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        attachment: {
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
        modelName: "LeadActivity",
        tableName: "sales_lead_activities",
        timestamps: false,
        underscored: true,
      },
    );

    (LeadActivityModel as any).initialized = true;
  }
  return LeadActivityModel;
}

export default async function LeadActivityModelFactory() {
  return getLeadActivityModel();
}
