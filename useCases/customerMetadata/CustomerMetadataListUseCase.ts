import Joi from "joi";
import CustomerMetadataModelFactory, { type CustomerMetadata } from "@/app/sales/models/CustomerMetadataModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListCustomerMetadataFilter = {
  customer_id?: string;
};

export type ListCustomerMetadataInput = {
  filter?: ListCustomerMetadataFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListCustomerMetadataQuery = {
  customer_id?: string;
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

const listCustomerMetadataSchema = Joi.object({
  filter: Joi.object({
    customer_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("created_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

export class CustomerMetadataListUseCase extends BaseUseCase<ListCustomerMetadataInput | void, CustomerMetadata[], ListCustomerMetadataQuery> {
  protected async preExec(input?: ListCustomerMetadataInput | void): Promise<ListCustomerMetadataQuery> {
    const validated = await this.validate<{
      filter?: ListCustomerMetadataFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listCustomerMetadataSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      customer_id: filter.customer_id || undefined,
      sortProperty: SORTABLE_COLUMNS[validated.sortProperty.toLowerCase()] ?? "created_at",
      sortDirection: validated.sortDirection.toUpperCase() as "ASC" | "DESC",
      offset: validated.offset,
      limit: validated.limit,
    };
  }

  protected async execute(context: ListCustomerMetadataQuery): Promise<CustomerMetadata[]> {
    const CustomerMetadataModel = await CustomerMetadataModelFactory();
    const conditions: Record<string, unknown> = { deleted_at: null };

    if (context.customer_id) {
      conditions.customer_id = context.customer_id;
    }

    const rows = await CustomerMetadataModel.findAll({
      where: conditions,
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => CustomerMetadataModel.toApi(row.toJSON()));
  }
}
