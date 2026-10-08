import Joi from "joi";
import { Op } from "sequelize";
import CustomerActivityModelFactory, { type CustomerActivity } from "@/app/sales/models/CustomerActivityModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListCustomerActivitiesFilter = {
  customer_id?: string;
  type?: string;
};

export type ListCustomerActivitiesInput = {
  filter?: ListCustomerActivitiesFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListCustomerActivitiesQuery = {
  customer_id?: string;
  type?: string;
  sortProperty: string;
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
  actor: ActivityActor;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  uuid: "uuid",
  occurred_at: "occurred_at",
  created_at: "created_at",
};

const listCustomerActivitiesSchema = Joi.object({
  filter: Joi.object({
    customer_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
    type: Joi.string().valid("call", "email", "meeting", "other").allow("").optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("occurred_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export class CustomerActivityListUseCase extends BaseUseCase<ListCustomerActivitiesInput | void, CustomerActivity[], ListCustomerActivitiesQuery> {
  protected async preExec(input?: ListCustomerActivitiesInput | void, actor?: ActivityActor): Promise<ListCustomerActivitiesQuery> {
    const validated = await this.validate<{
      filter?: ListCustomerActivitiesFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listCustomerActivitiesSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      customer_id: filter.customer_id || undefined,
      type: filter.type?.trim() || undefined,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "occurred_at",
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

  protected async execute(context: ListCustomerActivitiesQuery): Promise<CustomerActivity[]> {
    const CustomerActivityModel = await CustomerActivityModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }];

    if (context.customer_id) {
      conditions.push({ customer_id: context.customer_id });
    }

    if (context.type) {
      conditions.push({ type: context.type });
    }

    await this.applyOrganizationScope(conditions, context.actor);

    const rows = await CustomerActivityModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => CustomerActivityModel.toApi(row.toJSON()));
  }
}
