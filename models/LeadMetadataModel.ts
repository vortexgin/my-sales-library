import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type LeadMetadataStatus = "active" | "inactive" | "deleted";

export type LeadMetadata = {
  uuid: string;
  lead_metadata_field_id: string;
  value: string;
  status: LeadMetadataStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CreateLeadMetadataInput = {
  lead_metadata_field_id: string;
  value: string;
  status?: LeadMetadataStatus;
};

export type UpdateLeadMetadataInput = Partial<CreateLeadMetadataInput>;

export type LeadMetadataModelAttributes = Partial<Omit<LeadMetadata, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type LeadMetadataModelCreationAttributes = Partial<LeadMetadataModelAttributes>;

export class LeadMetadataModel extends Model<LeadMetadataModelAttributes, LeadMetadataModelCreationAttributes> {
  declare uuid: string;
  declare lead_metadata_field_id: string;
  declare value: string;
  declare status: LeadMetadataStatus;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(leadMetadata: any): LeadMetadata {
    return {
      uuid: leadMetadata.uuid,
      lead_metadata_field_id: leadMetadata.lead_metadata_field_id,
      value: leadMetadata.value,
      status: leadMetadata.status,
      created_at: leadMetadata.created_at ? new Date(leadMetadata.created_at).toISOString() : new Date().toISOString(),
      updated_at: leadMetadata.updated_at ? new Date(leadMetadata.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: leadMetadata.deleted_at ? new Date(leadMetadata.deleted_at).toISOString() : null,
    };
  }
}

let leadMetadataModelPromise: Promise<typeof LeadMetadataModel> | null = null;

export async function getLeadMetadataModel(): Promise<typeof LeadMetadataModel> {
  if ((LeadMetadataModel as any).initialized) {
    return LeadMetadataModel;
  }
  if (!leadMetadataModelPromise) {
    leadMetadataModelPromise = initLeadMetadataModel().catch((error) => {
      leadMetadataModelPromise = null;
      throw error;
    });
  }
  return leadMetadataModelPromise;
}

async function initLeadMetadataModel(): Promise<typeof LeadMetadataModel> {
  const sequelize = await getSequelizeInstance();

  {
    LeadMetadataModel.init(
      {
        uuid: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        lead_metadata_field_id: {
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
        modelName: "LeadMetadata",
        tableName: "sales_lead_metadata",
        timestamps: false,
        underscored: true,
      },
    );

    (LeadMetadataModel as any).initialized = true;
  }
  return LeadMetadataModel;
}

export default async function LeadMetadataModelFactory() {
  return getLeadMetadataModel();
}
