import Joi from "joi";
import { Op } from "sequelize";
import DeliveryOrderMetadataModelFactory, { type DeliveryOrderMetadata } from "@/app/sales/models/DeliveryOrderMetadataModel";
import DeliveryOrderModelFactory, { DeliveryOrderModel } from "@/app/sales/models/DeliveryOrderModel";
import { assertDeliveryOrderInScope, resolveActorOrganization } from "@/app/sales/useCases/deliveryOrderMetadata/deliveryOrderMetadataScope";
import type { ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListDeliveryOrderMetadataFilter = {
  sales_delivery_order_id?: string;
  sales_doc_metadata_field_id?: string;
  status?: string;
};

export type ListDeliveryOrderMetadataInput = {
  filter?: ListDeliveryOrderMetadataFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListDeliveryOrderMetadataQuery = {
  sales_delivery_order_id?: string;
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

const listDeliveryOrderMetadataSchema = Joi.object({
  filter: Joi.object({
    sales_delivery_order_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
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

export class DeliveryOrderMetadataListUseCase extends BaseUseCase<ListDeliveryOrderMetadataInput | void, DeliveryOrderMetadata[], ListDeliveryOrderMetadataQuery> {
  protected async preExec(input?: ListDeliveryOrderMetadataInput | void, actor?: ActivityActor): Promise<ListDeliveryOrderMetadataQuery> {
    const validated = await this.validate<{
      filter?: ListDeliveryOrderMetadataFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listDeliveryOrderMetadataSchema, input ?? {});
    const filter = validated.filter ?? {};

    if (filter.sales_delivery_order_id) {
      await assertDeliveryOrderInScope(filter.sales_delivery_order_id, actor ?? null);
    }

    return {
      sales_delivery_order_id: filter.sales_delivery_order_id || undefined,
      sales_doc_metadata_field_id: filter.sales_doc_metadata_field_id || undefined,
      status: filter.status?.trim() || undefined,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
      actor: actor ?? null,
    };
  }

  protected async execute(context: ListDeliveryOrderMetadataQuery): Promise<DeliveryOrderMetadata[]> {
    const DeliveryOrderMetadataModel = await DeliveryOrderMetadataModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }];

    if (context.status) {
      conditions.push({ status: context.status });
    }
    if (context.sales_doc_metadata_field_id) {
      conditions.push({ sales_doc_metadata_field_id: context.sales_doc_metadata_field_id });
    }

    if (context.sales_delivery_order_id) {
      conditions.push({ sales_delivery_order_id: context.sales_delivery_order_id });
    } else {
      await DeliveryOrderModelFactory();
      const organizationId = await resolveActorOrganization(context.actor);
      const orders = await DeliveryOrderModel.findAll({
        attributes: ["uuid"],
        where: { organization_id: organizationId, deleted_at: null },
      });
      conditions.push({ sales_delivery_order_id: { [Op.in]: orders.map((order) => order.uuid) } });
    }

    const rows = await DeliveryOrderMetadataModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => DeliveryOrderMetadataModel.toApi(row.toJSON()));
  }
}
