import Joi from "joi";
import { Op } from "sequelize";
import LeadMetadataFieldModelFactory, { type LeadMetadataField } from "@/app/sales/models/LeadMetadataFieldModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { escapeLike } from "@/libraries/String";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListLeadMetadataFieldsFilter = {
  q?: string;
  name?: string;
  status?: string;
};

export type ListLeadMetadataFieldsInput = {
  filter?: ListLeadMetadataFieldsFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListLeadMetadataFieldsQuery = {
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

const listLeadMetadataFieldsSchema = Joi.object({
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

export class LeadMetadataFieldListUseCase extends BaseUseCase<ListLeadMetadataFieldsInput | void, LeadMetadataField[], ListLeadMetadataFieldsQuery> {
  protected async preExec(input?: ListLeadMetadataFieldsInput | void, actor?: ActivityActor): Promise<ListLeadMetadataFieldsQuery> {
    const validated = await this.validate<{
      filter?: ListLeadMetadataFieldsFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listLeadMetadataFieldsSchema, input ?? {});
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
   * Restricts listing to the actor's organization fields when the
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

  protected async execute(context: ListLeadMetadataFieldsQuery): Promise<LeadMetadataField[]> {
    const LeadMetadataFieldModel = await LeadMetadataFieldModelFactory();
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

    const rows = await LeadMetadataFieldModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => LeadMetadataFieldModel.toApi(row.toJSON()));
  }
}
