import Joi from "joi";
import { Op } from "sequelize";
import LeadStatusModelFactory, { type LeadStatus } from "@/app/sales/models/LeadStatusModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { escapeLike } from "@/libraries/String";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListLeadStatusesFilter = {
  q?: string;
  name?: string;
  status?: string;
};

export type ListLeadStatusesInput = {
  filter?: ListLeadStatusesFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListLeadStatusesQuery = {
  q?: string;
  name?: string;
  status?: string;
  sortProperty: string;
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
  actor: ActivityActor;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  uuid: "uuid",
  name: "name",
  status: "status",
  created_at: "created_at",
  updated_at: "updated_at",
};

const listLeadStatusesSchema = Joi.object({
  filter: Joi.object({
    q: Joi.string().trim().allow("").optional(),
    name: Joi.string().trim().allow("").optional(),
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

export class LeadStatusListUseCase extends BaseUseCase<ListLeadStatusesInput | void, LeadStatus[], ListLeadStatusesQuery> {
  protected async preExec(input?: ListLeadStatusesInput | void, actor?: ActivityActor): Promise<ListLeadStatusesQuery> {
    const validated = await this.validate<{
      filter?: ListLeadStatusesFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listLeadStatusesSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      q: filter.q?.trim() || undefined,
      name: filter.name?.trim() || undefined,
      status: filter.status?.trim() || undefined,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
      actor: actor ?? null,
    };
  }

  /**
   * Restricts listing to the actor's organization statuses when the
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

  protected async execute(context: ListLeadStatusesQuery): Promise<LeadStatus[]> {
    const LeadStatusModel = await LeadStatusModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }];

    if (context.status) {
      conditions.push({ status: context.status });
    }

    if (context.name) {
      conditions.push({ name: { [Op.iLike]: `%${escapeLike(context.name)}%` } });
    }

    if (context.q) {
      const pattern = `%${escapeLike(context.q)}%`;
      conditions.push({
        [Op.or]: [{ name: { [Op.iLike]: pattern } }, { description: { [Op.iLike]: pattern } }],
      });
    }

    await this.applyOrganizationScope(conditions, context.actor);

    const rows = await LeadStatusModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => LeadStatusModel.toApi(row.toJSON()));
  }
}
