import Joi from "joi";
import { Op } from "sequelize";
import SalesOrderMetadataModelFactory, { type SalesOrderMetadata } from "@/app/sales/models/SalesOrderMetadataModel";
import SalesOrderModelFactory, { SalesOrderModel } from "@/app/sales/models/SalesOrderModel";
import { assertSalesOrderInScope, resolveActorOrganization } from "@/app/sales/useCases/salesOrderMetadata/salesOrderMetadataScope";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListSalesOrderMetadataFilter = {
  sales_order_id?: string;
  sales_doc_metadata_field_id?: string;
  status?: string;
};

export type ListSalesOrderMetadataInput = {
  filter?: ListSalesOrderMetadataFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListSalesOrderMetadataQuery = {
  sales_order_id?: string;
  sales_doc_metadata_field_id?: string;
  status?: string;
  sortProperty: string;
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
  actor: ActivityActor;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  uuid: "uuid",
  created_at: "created_at",
  updated_at: "updated_at",
};

const listSalesOrderMetadataSchema = Joi.object({
  filter: Joi.object({
    sales_order_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
    sales_doc_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
    status: Joi.string().trim().allow("").optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("created_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

export class SalesOrderMetadataListUseCase extends BaseUseCase<ListSalesOrderMetadataInput | void, SalesOrderMetadata[], ListSalesOrderMetadataQuery> {
  protected async preExec(input?: ListSalesOrderMetadataInput | void, actor?: ActivityActor): Promise<ListSalesOrderMetadataQuery> {
    const validated = await this.validate<{
      filter?: ListSalesOrderMetadataFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listSalesOrderMetadataSchema, input ?? {});
    const filter = validated.filter ?? {};

    if (filter.sales_order_id) {
      await assertSalesOrderInScope(filter.sales_order_id, actor ?? null);
    }

    return {
      sales_order_id: filter.sales_order_id || undefined,
      sales_doc_metadata_field_id: filter.sales_doc_metadata_field_id || undefined,
      status: filter.status?.trim() || undefined,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
      actor: actor ?? null,
    };
  }

  protected async execute(context: ListSalesOrderMetadataQuery): Promise<SalesOrderMetadata[]> {
    const SalesOrderMetadataModel = await SalesOrderMetadataModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }];

    if (context.status) {
      conditions.push({ status: context.status });
    }

    if (context.sales_doc_metadata_field_id) {
      conditions.push({ sales_doc_metadata_field_id: context.sales_doc_metadata_field_id });
    }

    if (context.sales_order_id) {
      conditions.push({ sales_order_id: context.sales_order_id });
    } else {
      // Rows carry no org column — scope through the parent sales orders.
      await SalesOrderModelFactory();
      const organizationId = await resolveActorOrganization(context.actor);
      const orders = await SalesOrderModel.findAll({
        attributes: ["uuid"],
        where: { organization_id: organizationId, deleted_at: null },
      });
      const allowed = orders.map((order) => order.uuid);
      conditions.push({ sales_order_id: { [Op.in]: allowed } });
    }

    const rows = await SalesOrderMetadataModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => SalesOrderMetadataModel.toApi(row.toJSON()));
  }
}
