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
    source: Joi.string().trim().allow("").optional(),
    assigned_to: Joi.string().uuid({ version: "uuidv4" }).optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("created_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(20),
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
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
      actor: actor ?? null,
    };
  }

  /**
   * Restricts listing to the actor's organization leads when the
   * organization module is present and the actor is linked.
   * Unlinked actors (and missing module) keep full visibility.
   */
  private async applyOrganizationScope(
    conditions: Record<string, unknown>[],
    actor: ActivityActor,
  ): Promise<void> {
    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    if (typeof actorUuid !== "string") {
      return;
    }

    const organization = await UserModel.resolveOrganization(actorUuid);
    if (!organization) {
      return;
    }

    conditions.push({ organization_id: organization.uuid });
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
      conditions.push({ assigned_to: context.assigned_to });
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
