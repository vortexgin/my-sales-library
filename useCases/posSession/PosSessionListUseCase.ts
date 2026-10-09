import Joi from "joi";
import { Op } from "sequelize";
import PosSessionModelFactory, { type PosSession } from "@/app/sales/models/PosSessionModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListPosSessionsFilter = {
  status?: string;
};

export type ListPosSessionsInput = {
  filter?: ListPosSessionsFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListPosSessionsQuery = {
  status?: string;
  sortProperty: string;
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
  actor: ActivityActor;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  uuid: "uuid",
  opened_at: "opened_at",
  closed_at: "closed_at",
  status: "status",
  created_at: "created_at",
  updated_at: "updated_at",
};

const listPosSessionsSchema = Joi.object({
  filter: Joi.object({
    status: Joi.string().valid("open", "closed", "auto_closed").allow("").optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("created_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export class PosSessionListUseCase extends BaseUseCase<ListPosSessionsInput | void, PosSession[], ListPosSessionsQuery> {
  protected async preExec(input?: ListPosSessionsInput | void, actor?: ActivityActor): Promise<ListPosSessionsQuery> {
    const validated = await this.validate<{
      filter?: ListPosSessionsFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listPosSessionsSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      status: filter.status?.trim() || undefined,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
      actor: actor ?? null,
    };
  }

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

  protected async execute(context: ListPosSessionsQuery): Promise<PosSession[]> {
    const PosSessionModel = await PosSessionModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }];

    if (context.status) {
      conditions.push({ status: context.status });
    }

    await this.applyOrganizationScope(conditions, context.actor);

    const rows = await PosSessionModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => PosSessionModel.toApi(row.toJSON()));
  }
}
