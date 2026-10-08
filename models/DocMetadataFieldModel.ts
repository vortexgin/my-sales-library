import { DataTypes, Model } from "sequelize";
import { getSequelizeInstance } from "@/database/sequelize";

export type DocMetadataFieldState = "active" | "inactive" | "deleted";

export type DocMetadataField = {
  uuid: string;
  organization_id: string | null;
  name: string;
  description: string;
  status: DocMetadataFieldState;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CreateDocMetadataFieldInput = {
  name: string;
  description: string;
  status?: DocMetadataFieldState;
};

export type UpdateDocMetadataFieldInput = Partial<CreateDocMetadataFieldInput>;

export type DocMetadataFieldModelAttributes = Partial<Omit<DocMetadataField, "created_at" | "updated_at" | "deleted_at">> & {
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type DocMetadataFieldModelCreationAttributes = Partial<DocMetadataFieldModelAttributes>;

export class DocMetadataFieldModel extends Model<DocMetadataFieldModelAttributes, DocMetadataFieldModelCreationAttributes> {
  declare uuid: string;
  declare organization_id: string | null;
  declare name: string;
  declare description: string;
  declare status: DocMetadataFieldState;
  declare created_at: Date;
  declare updated_at: Date;
  declare deleted_at: Date | null;

  static toApi(field: any): DocMetadataField {
    return {
      uuid: field.uuid,
      organization_id: field.organization_id ?? null,
      name: field.name,
      description: field.description,
      status: field.status,
      created_at: field.created_at ? new Date(field.created_at).toISOString() : new Date().toISOString(),
      updated_at: field.updated_at ? new Date(field.updated_at).toISOString() : new Date().toISOString(),
      deleted_at: field.deleted_at ? new Date(field.deleted_at).toISOString() : null,
    };
  }
}

let docMetadataFieldModelPromise: Promise<typeof DocMetadataFieldModel> | null = null;

export async function getDocMetadataFieldModel(): Promise<typeof DocMetadataFieldModel> {
  if ((DocMetadataFieldModel as any).initialized) {
    return DocMetadataFieldModel;
  }
  if (!docMetadataFieldModelPromise) {
    docMetadataFieldModelPromise = initDocMetadataFieldModel().catch((error) => {
      docMetadataFieldModelPromise = null;
      throw error;
    });
  }
  return docMetadataFieldModelPromise;
}

async function initDocMetadataFieldModel(): Promise<typeof DocMetadataFieldModel> {
  const sequelize = await getSequelizeInstance();

  {
    DocMetadataFieldModel.init(
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
        modelName: "DocMetadataField",
        tableName: "sales_doc_metadata_fields",
        timestamps: false,
        underscored: true,
      },
    );

    (DocMetadataFieldModel as any).initialized = true;
  }
  return DocMetadataFieldModel;
}

export default async function DocMetadataFieldModelFactory() {
  return getDocMetadataFieldModel();
}
