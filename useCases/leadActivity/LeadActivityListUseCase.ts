import Joi from "joi";
import { Op } from "sequelize";
import LeadActivityModelFactory, { type LeadActivity } from "@/app/sales/models/LeadActivityModel";
import { escapeLike } from "@/libraries/String";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListLeadActivitiesFilter = {
  q?: string;
  leads_id?: string;
  status?: string;
};

export type ListLeadActivitiesInput = {
  filter?: ListLeadActivitiesFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListLeadActivitiesQuery = {
  q?: string;
  leads_id?: string;
  status?: string;
  sortProperty: string;
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  uuid: "uuid",
  pic: "pic",
  meeting_start: "meeting_start",
  meeting_end: "meeting_end",
  status: "status",
  created_at: "created_at",
  updated_at: "updated_at",
};

const listLeadActivitiesSchema = Joi.object({
  filter: Joi.object({
    q: Joi.string().trim().allow("").optional(),
    leads_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
    status: Joi.string().trim().allow("").optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("created_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(1000).default(20),
});

export class LeadActivityListUseCase extends BaseUseCase<ListLeadActivitiesInput | void, LeadActivity[], ListLeadActivitiesQuery> {
  protected async preExec(input?: ListLeadActivitiesInput | void): Promise<ListLeadActivitiesQuery> {
    const validated = await this.validate<{
      filter?: ListLeadActivitiesFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listLeadActivitiesSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      q: filter.q?.trim() || undefined,
      leads_id: filter.leads_id || undefined,
      status: filter.status?.trim() || undefined,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
    };
  }

  protected async execute(context: ListLeadActivitiesQuery): Promise<LeadActivity[]> {
    const LeadActivityModel = await LeadActivityModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }];

    if (context.leads_id) {
      conditions.push({ leads_id: context.leads_id });
    }

    if (context.status) {
      conditions.push({ status: context.status });
    }

    if (context.q) {
      const pattern = `%${escapeLike(context.q)}%`;
      conditions.push({
        [Op.or]: [
          { pic: { [Op.iLike]: pattern } },
          { email: { [Op.iLike]: pattern } },
          { phone: { [Op.iLike]: pattern } },
          { notes: { [Op.iLike]: pattern } },
        ],
      });
    }

    const rows = await LeadActivityModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => LeadActivityModel.toApi(row.toJSON()));
  }
}
