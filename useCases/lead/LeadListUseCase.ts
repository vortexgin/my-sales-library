import Joi from "joi";
import { Op } from "sequelize";
import LeadModelFactory, { type Lead } from "@/app/sales/models/LeadModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { escapeLike } from "@/libraries/String";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListLeadsFilter = {
  q?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  status?: string;
  source?: string;
  assigned_to?: string;
  assigned?: string;
  value_min?: number;
  value_max?: number;
  updated_before?: string;
  stale_days?: number;
};

export type ListLeadsInput = {
  filter?: ListLeadsFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListLeadsQuery = {
  q?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  status?: string;
  source?: string;
  assigned_to?: string;
  assigned?: "me" | "unassigned" | "all";
  value_min?: number;
  value_max?: number;
  updated_before?: string;
  stale_days?: number;
  sortProperty: string;
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
  actor: ActivityActor;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  uuid: "uuid",
  name: "name",
  email: "email",
  phone: "phone_number",
  phone_number: "phone_number",
  company: "company",
  source: "source",
  status: "status",
  value: "value",
  created_at: "created_at",
  updated_at: "updated_at",
};

const listLeadsSchema = Joi.object({
  filter: Joi.object({
    q: Joi.string().trim().allow("").optional(),
    name: Joi.string().trim().allow("").optional(),
    email: Joi.string().trim().allow("").optional(),
    phone: Joi.string().trim().allow("").optional(),
    company: Joi.string().trim().allow("").optional(),
    status: Joi.string().trim().allow("").optional(),
    source: Joi.string().valid("website", "referral", "ads", "cold_call", "event", "other").allow("").optional(),
    assigned_to: Joi.string().uuid({ version: "uuidv4" }).optional(),
    assigned: Joi.string().valid("me", "unassigned", "all").optional(),
    value_min: Joi.number().integer().min(0).optional(),
    value_max: Joi.number().integer().min(0).optional(),
    updated_before: Joi.date().iso().optional(),
    stale_days: Joi.number().integer().min(1).max(90).optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("created_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(1000).default(20),
});

export class LeadListUseCase extends BaseUseCase<ListLeadsInput | void, Lead[], ListLeadsQuery> {
  protected async preExec(input?: ListLeadsInput | void, actor?: ActivityActor): Promise<ListLeadsQuery> {
    const validated = await this.validate<{
      filter?: ListLeadsFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listLeadsSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      q: filter.q?.trim() || undefined,
      name: filter.name?.trim() || undefined,
      email: filter.email?.trim().toLowerCase() || undefined,
      phone: filter.phone?.trim() || undefined,
      company: filter.company?.trim() || undefined,
      status: filter.status?.trim() || undefined,
      source: filter.source?.trim() || undefined,
      assigned_to: filter.assigned_to || undefined,
      assigned: filter.assigned as ListLeadsQuery["assigned"],
      value_min: filter.value_min,
      value_max: filter.value_max,
      updated_before: filter.updated_before,
      stale_days: filter.stale_days,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
      actor: actor ?? null,
    };
  }

  /**
   * Strict same-org scoping (mirrors Get/convert): linked actors see their
   * org's rows, unlinked actors see unlinked rows only.
   */
  private async applyOrganizationScope(
    conditions: Record<string, unknown>[],
    actor: ActivityActor,
  ): Promise<void> {
    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    if (typeof actorUuid !== "string") {
      conditions.push({ organization_id: null });
      return;
    }

    const organization = await UserModel.resolveOrganization(actorUuid);
    conditions.push({ organization_id: organization?.uuid ?? null });
  }

  protected async execute(context: ListLeadsQuery): Promise<Lead[]> {
    const LeadModel = await LeadModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }];

    if (context.email) {
      conditions.push({ email: context.email });
    }

    if (context.phone) {
      conditions.push({ phone_number: context.phone });
    }

    if (context.status) {
      conditions.push({ status: context.status });
    }

    if (context.source) {
      conditions.push({ source: context.source });
    }

    if (context.assigned_to) {
      // Explicit assignee wins over the assigned shorthand.
      conditions.push({ assigned_to: context.assigned_to });
    } else if (context.assigned === "me") {
      const actorUuid = (context.actor as Record<string, unknown> | null)?.uuid;
      conditions.push({ assigned_to: typeof actorUuid === "string" ? actorUuid : "__none__" });
    } else if (context.assigned === "unassigned") {
      conditions.push({ assigned_to: null });
    }

    if (typeof context.value_min === "number" || typeof context.value_max === "number") {
      // Rows with null value are excluded when a value bound is present.
      if (typeof context.value_min === "number" && typeof context.value_max === "number") {
        conditions.push({ value: { [Op.gte]: context.value_min, [Op.lte]: context.value_max } });
      } else if (typeof context.value_min === "number") {
        conditions.push({ value: { [Op.gte]: context.value_min } });
      } else {
        conditions.push({ value: { [Op.lte]: context.value_max as number } });
      }
    }

    if (context.updated_before || context.stale_days) {
      const cutoff = context.updated_before
        ? new Date(context.updated_before)
        : new Date(Date.now() - (context.stale_days as number) * 86400e3);
      conditions.push({ updated_at: { [Op.lt]: cutoff } });
    }

    if (context.name) {
      conditions.push({ name: { [Op.iLike]: `%${escapeLike(context.name)}%` } });
    }

    if (context.company) {
      conditions.push({ company: { [Op.iLike]: `%${escapeLike(context.company)}%` } });
    }

    if (context.q) {
      const pattern = `%${escapeLike(context.q)}%`;
      conditions.push({
        [Op.or]: [
          { name: { [Op.iLike]: pattern } },
          { email: { [Op.iLike]: pattern } },
          { phone_number: { [Op.iLike]: pattern } },
          { company: { [Op.iLike]: pattern } },
        ],
      });
    }

    await this.applyOrganizationScope(conditions, context.actor);

    const leads = await LeadModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return leads.map((lead) => LeadModel.toApi(lead.toJSON()));
  }
}
