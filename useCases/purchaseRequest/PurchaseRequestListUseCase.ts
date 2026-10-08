import Joi from "joi";
import { Op } from "sequelize";
import PurchaseRequestModelFactory, { type PurchaseRequest } from "@/app/sales/models/PurchaseRequestModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListPurchaseRequestsFilter = {
  customer_id?: string;
  status?: string;
};

export type ListPurchaseRequestsInput = {
  filter?: ListPurchaseRequestsFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListPurchaseRequestsQuery = {
  customer_id?: string;
  status?: string;
  sortProperty: string;
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
  actor: ActivityActor;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  uuid: "uuid",
  status: "status",
  grand_total: "grand_total",
  created_at: "created_at",
  updated_at: "updated_at",
};

const listPurchaseRequestsSchema = Joi.object({
  filter: Joi.object({
    customer_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
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

export class PurchaseRequestListUseCase extends BaseUseCase<ListPurchaseRequestsInput | void, PurchaseRequest[], ListPurchaseRequestsQuery> {
  protected async preExec(input?: ListPurchaseRequestsInput | void, actor?: ActivityActor): Promise<ListPurchaseRequestsQuery> {
    const validated = await this.validate<{
      filter?: ListPurchaseRequestsFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listPurchaseRequestsSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      customer_id: filter.customer_id || undefined,
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
      return;
    }

    const organization = await UserModel.resolveOrganization(actorUuid);
    if (!organization) {
      return;
    }

    conditions.push({ organization_id: organization.uuid });
  }

  protected async execute(context: ListPurchaseRequestsQuery): Promise<PurchaseRequest[]> {
    const PurchaseRequestModel = await PurchaseRequestModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }];

    if (context.customer_id) {
      conditions.push({ customer_id: context.customer_id });
    }

    if (context.status) {
      conditions.push({ status: context.status });
    }

    await this.applyOrganizationScope(conditions, context.actor);

    const rows = await PurchaseRequestModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => PurchaseRequestModel.toApi(row.toJSON()));
  }
}
