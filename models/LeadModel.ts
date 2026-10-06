import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type LeadSource = "website" | "referral" | "ads" | "cold_call" | "event" | "other";

/**
 * Default pipeline stages. Lead status is a free-form string so teams
 * can define their own stages via lead-status master data; these are
 * the conventional defaults (also the create default: "new").
 */
export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost";

export type Lead = {
  uuid: string;
  name: string;
  email: string;
  phone_number: string;
  company: string | null;
  source: LeadSource;
  status: string;
  value: number | null;
  assigned_to: string | null;
  /** Assignee label from the eager-loaded user association. Null when unassigned. */
  assignee: { id: string; name: string; email: string } | null;
  organization_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type LeadMetadataNestedInput = {
  uuid?: string;
  lead_metadata_field_id?: string;
  field_name?: string;
  value: string;
};

export type CreateLeadInput = {
  name: string;
  email: string;
  phone_number: string;
  company?: string | null;
  source?: LeadSource;
  status?: string;
  value?: number | null;
  assigned_to?: string | null;
  organization_id?: string | null;
  notes?: string | null;
  metadata?: LeadMetadataNestedInput[];
};

export type UpdateLeadInput = Partial<CreateLeadInput>;

export type LeadModelAttributes = Partial<Omit<Lead, "created_at" | "updated_at" | "deleted_at" | "assignee">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type LeadModelCreationAttributes = Partial<LeadModelAttributes>;

export class LeadModel extends Model<LeadModelAttributes, LeadModelCreationAttributes> {
  declare uuid: string;
  declare name: string;
  declare email: string;
  declare phone_number: string;
  declare company: string | null;
  declare source: LeadSource;
  declare status: string;
  declare value: number | null;
  declare assigned_to: string | null;
  declare organization_id: string | null;
  declare notes: string | null;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(lead: any): Lead {
    // Assignee comes from the eager-loaded `assignee` association
    // (LeadGetUseCase include). Null when unassigned or not loaded.
    const assignee = lead.assignee ?? null;
    return {
      uuid: lead.uuid,
      name: lead.name,
      email: lead.email,
      phone_number: lead.phone_number,
      company: lead.company ?? null,
      source: lead.source,
      status: lead.status,
      value: typeof lead.value === "number" ? lead.value : null,
      assigned_to: lead.assigned_to ?? null,
      assignee: assignee
        ? { id: assignee.uuid ?? assignee.id ?? "", name: assignee.name ?? "", email: assignee.email ?? "" }
        : null,
      organization_id: lead.organization_id ?? null,
      notes: lead.notes ?? null,
      created_at: lead.created_at ? new Date(lead.created_at).toISOString() : new Date().toISOString(),
      updated_at: lead.updated_at ? new Date(lead.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: lead.deleted_at ? new Date(lead.deleted_at).toISOString() : null,
    };
  }
}

let leadModelPromise: Promise<typeof LeadModel> | null = null;

export async function getLeadModel(): Promise<typeof LeadModel> {
  if ((LeadModel as any).initialized) {
    return LeadModel;
  }
  if (!leadModelPromise) {
    leadModelPromise = initLeadModel().catch((error) => {
      leadModelPromise = null;
      throw error;
    });
  }
  return leadModelPromise;
}

async function initLeadModel(): Promise<typeof LeadModel> {
  const sequelize = await getSequelizeInstance();

  {
    LeadModel.init(
      {
        uuid: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        name: {
          type: DataTypes.STRING(120),
          allowNull: false,
        },
        email: {
          type: DataTypes.STRING(160),
          allowNull: false,
          unique: true,
          validate: {
            isEmail: true,
          },
        },
        phone_number: {
          type: DataTypes.STRING(30),
          allowNull: false,
        },
        company: {
          type: DataTypes.STRING(160),
          allowNull: true,
          defaultValue: null,
        },
        source: {
          type: DataTypes.ENUM("website", "referral", "ads", "cold_call", "event", "other"),
          allowNull: false,
          defaultValue: "website",
        },
        status: {
          type: DataTypes.STRING(60),
          allowNull: false,
          defaultValue: "new",
        },
        value: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: null,
        },
        assigned_to: {
          type: DataTypes.UUID,
          allowNull: true,
          defaultValue: null,
        },
        organization_id: {
          type: DataTypes.UUID,
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
        modelName: "Lead",
        tableName: "sales_leads",
        timestamps: false,
        underscored: true,
      },
    );

    (LeadModel as any).initialized = true;
  }
  return LeadModel;
}

export default async function LeadModelFactory() {
  return getLeadModel();
}
