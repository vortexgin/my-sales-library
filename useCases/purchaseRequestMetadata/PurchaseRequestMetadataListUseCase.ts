import Joi from "joi";
import { Op } from "sequelize";
import PurchaseRequestMetadataModelFactory, { type PurchaseRequestMetadata } from "@/app/sales/models/PurchaseRequestMetadataModel";
import PurchaseRequestModelFactory, { PurchaseRequestModel } from "@/app/sales/models/PurchaseRequestModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import type { ActivityActor } from "@/app/base/models/ActivityLogModel";
import { findScopedParent, resolveActorOrganizationId } from "@/app/sales/useCases/purchaseRequestMetadata/parentScope";

export type ListPurchaseRequestMetadataFilter = {
  purchase_request_id?: string;
};

export type ListPurchaseRequestMetadataInput = {
  filter?: ListPurchaseRequestMetadataFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListPurchaseRequestMetadataQuery = {
  purchase_request_id?: string;
  purchaseRequestIds: string[] | null;
  sortProperty: string;
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  uuid: "uuid",
  created_at: "created_at",
  updated_at: "updated_at",
};

const listPurchaseRequestMetadataSchema = Joi.object({
  filter: Joi.object({
    purchase_request_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("created_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

export class PurchaseRequestMetadataListUseCase extends BaseUseCase<ListPurchaseRequestMetadataInput | void, PurchaseRequestMetadata[], ListPurchaseRequestMetadataQuery> {
  protected async preExec(input?: ListPurchaseRequestMetadataInput | void, actor?: ActivityActor): Promise<ListPurchaseRequestMetadataQuery> {
    const validated = await this.validate<{
      filter?: ListPurchaseRequestMetadataFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listPurchaseRequestMetadataSchema, input ?? {});
    const filter = validated.filter ?? {};

    let purchaseRequestIds: string[] | null = null;
    if (filter.purchase_request_id) {
      await findScopedParent(filter.purchase_request_id, actor ?? null);
    } else {
      // No parent filter: constrain rows to purchase requests in the actor's org.
      const organizationId = await resolveActorOrganizationId(actor ?? null);
      await PurchaseRequestModelFactory();
      const parents = await PurchaseRequestModel.findAll({
        attributes: ["uuid"],
        where: { organization_id: organizationId, deleted_at: null },
      });
      purchaseRequestIds = parents.map((row) => row.uuid);
    }

    return {
      purchase_request_id: filter.purchase_request_id || undefined,
      purchaseRequestIds,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
    };
  }

  protected async execute(context: ListPurchaseRequestMetadataQuery): Promise<PurchaseRequestMetadata[]> {
    const PurchaseRequestMetadataModel = await PurchaseRequestMetadataModelFactory();
    const conditions: Record<string, unknown> = { deleted_at: null };

    if (context.purchase_request_id) {
      conditions.purchase_request_id = context.purchase_request_id;
    } else if (context.purchaseRequestIds) {
      conditions.purchase_request_id = { [Op.in]: context.purchaseRequestIds };
    }

    const rows = await PurchaseRequestMetadataModel.findAll({
      where: conditions,
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => PurchaseRequestMetadataModel.toApi(row.toJSON()));
  }
}
