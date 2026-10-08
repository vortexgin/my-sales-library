import Joi from "joi";
import { Op } from "sequelize";
import SalesOrderModelFactory, { type SalesOrder } from "@/app/sales/models/SalesOrderModel";
import { customerNameById } from "@/app/sales/libraries/customerLabels";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListSalesOrdersFilter = {
  customer_id?: string;
  purchase_request_id?: string;
  warehouse_id?: string;
  status?: string;
};

export type ListSalesOrdersInput = {
  filter?: ListSalesOrdersFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListSalesOrdersQuery = {
  customer_id?: string;
  purchase_request_id?: string;
  warehouse_id?: string;
  status?: string;
  sortProperty: string;
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
  actor: ActivityActor;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  uuid: "uuid",
  doc_number: "doc_number",
  status: "status",
  grand_total: "grand_total",
  created_at: "created_at",
  updated_at: "updated_at",
};

const listSalesOrdersSchema = Joi.object({
  filter: Joi.object({
    customer_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
    purchase_request_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
    warehouse_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
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

export class SalesOrderListUseCase extends BaseUseCase<ListSalesOrdersInput | void, SalesOrder[], ListSalesOrdersQuery> {
  protected async preExec(input?: ListSalesOrdersInput | void, actor?: ActivityActor): Promise<ListSalesOrdersQuery> {
    const validated = await this.validate<{
      filter?: ListSalesOrdersFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listSalesOrdersSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      customer_id: filter.customer_id || undefined,
      purchase_request_id: filter.purchase_request_id || undefined,
      warehouse_id: filter.warehouse_id || undefined,
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

  protected async execute(context: ListSalesOrdersQuery): Promise<SalesOrder[]> {
    const SalesOrderModel = await SalesOrderModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }];

    if (context.customer_id) {
      conditions.push({ customer_id: context.customer_id });
    }

    if (context.purchase_request_id) {
      conditions.push({ purchase_request_id: context.purchase_request_id });
    }

    if (context.warehouse_id) {
      conditions.push({ warehouse_id: context.warehouse_id });
    }

    if (context.status) {
      conditions.push({ status: context.status });
    }

    await this.applyOrganizationScope(conditions, context.actor);

    const rows = await SalesOrderModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    const names = await customerNameById(rows.map((row) => row.customer_id));
    return rows.map((row) => {
      const json = row.toJSON() as Record<string, unknown>;
      const name = names.get(row.customer_id);
      return SalesOrderModel.toApi(name ? { ...json, customer: { uuid: row.customer_id, name } } : json);
    });
  }
}
