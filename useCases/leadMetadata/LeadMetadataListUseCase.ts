import Joi from "joi";
import { Op } from "sequelize";
import LeadMetadataModelFactory, { type LeadMetadata } from "@/app/sales/models/LeadMetadataModel";
import { escapeLike } from "@/libraries/String";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListLeadMetadataFilter = {
  q?: string;
  lead_metadata_field_id?: string;
  status?: string;
};

export type ListLeadMetadataInput = {
  filter?: ListLeadMetadataFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListLeadMetadataQuery = {
  q?: string;
  lead_metadata_field_id?: string;
  status?: string;
  sortProperty: string;
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  uuid: "uuid",
  status: "status",
  created_at: "created_at",
  updated_at: "updated_at",
};

const listLeadMetadataSchema = Joi.object({
  filter: Joi.object({
    q: Joi.string().trim().allow("").optional(),
    lead_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
    status: Joi.string().trim().allow("").optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("created_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export class LeadMetadataListUseCase extends BaseUseCase<ListLeadMetadataInput | void, LeadMetadata[], ListLeadMetadataQuery> {
  protected async preExec(input?: ListLeadMetadataInput | void): Promise<ListLeadMetadataQuery> {
    const validated = await this.validate<{
      filter?: ListLeadMetadataFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listLeadMetadataSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      q: filter.q?.trim() || undefined,
      lead_metadata_field_id: filter.lead_metadata_field_id || undefined,
      status: filter.status?.trim() || undefined,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
    };
  }

  protected async execute(context: ListLeadMetadataQuery): Promise<LeadMetadata[]> {
    const LeadMetadataModel = await LeadMetadataModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }];

    if (context.status) {
      conditions.push({ status: context.status });
    }

    if (context.lead_metadata_field_id) {
      conditions.push({ lead_metadata_field_id: context.lead_metadata_field_id });
    }

    if (context.q) {
      conditions.push({ value: { [Op.iLike]: `%${escapeLike(context.q)}%` } });
    }

    const rows = await LeadMetadataModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => LeadMetadataModel.toApi(row.toJSON()));
  }
}
