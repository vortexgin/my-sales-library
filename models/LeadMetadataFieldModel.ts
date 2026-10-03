import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type LeadMetadataFieldState = "active" | "inactive" | "deleted";

export type LeadMetadataField = {
  uuid: string;
  organization_id: string | null;
  name: string;
  description: string;
  status: LeadMetadataFieldState;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CreateLeadMetadataFieldInput = {
  name: string;
  description: string;
  status?: LeadMetadataFieldState;
};

export type UpdateLeadMetadataFieldInput = Partial<CreateLeadMetadataFieldInput>;

export type LeadMetadataFieldModelAttributes = Partial<Omit<LeadMetadataField, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type LeadMetadataFieldModelCreationAttributes = Partial<LeadMetadataFieldModelAttributes>;

export class LeadMetadataFieldModel extends Model<LeadMetadataFieldModelAttributes, LeadMetadataFieldModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare name: string;
  declare description: string;
  declare status: LeadMetadataFieldState;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(leadMetadataField: any): LeadMetadataField {
    return {
      uuid: leadMetadataField.uuid,
      organization_id: leadMetadataField.organization_id ?? null,
      name: leadMetadataField.name,
      description: leadMetadataField.description,
      status: leadMetadataField.status,
      created_at: leadMetadataField.created_at ? new Date(leadMetadataField.created_at).toISOString() : new Date().toISOString(),
      updated_at: leadMetadataField.updated_at ? new Date(leadMetadataField.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: leadMetadataField.deleted_at ? new Date(leadMetadataField.deleted_at).toISOString() : null,
    };
  }
}

let leadMetadataFieldModelPromise: Promise<typeof LeadMetadataFieldModel> | null = null;

export async function getLeadMetadataFieldModel(): Promise<typeof LeadMetadataFieldModel> {
  if ((LeadMetadataFieldModel as any).initialized) {
    return LeadMetadataFieldModel;
  }
  if (!leadMetadataFieldModelPromise) {
    leadMetadataFieldModelPromise = initLeadMetadataFieldModel().catch((error) => {
      leadMetadataFieldModelPromise = null;
      throw error;
    });
  }
  return leadMetadataFieldModelPromise;
}

async function initLeadMetadataFieldModel(): Promise<typeof LeadMetadataFieldModel> {
  const sequelize = await getSequelizeInstance();

  {
    LeadMetadataFieldModel.init(
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
        modelName: "LeadMetadataField",
        tableName: "sales_lead_metadata_fields",
        timestamps: false,
        underscored: true,
      },
    );

    (LeadMetadataFieldModel as any).initialized = true;
  }
  return LeadMetadataFieldModel;
}

export default async function LeadMetadataFieldModelFactory() {
  return getLeadMetadataFieldModel();
}
