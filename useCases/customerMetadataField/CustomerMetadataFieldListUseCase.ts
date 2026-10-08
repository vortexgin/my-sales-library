import Joi from "joi";
import { Op } from "sequelize";
import CustomerMetadataFieldModelFactory, { type CustomerMetadataField } from "@/app/sales/models/CustomerMetadataFieldModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { escapeLike } from "@/libraries/String";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListCustomerMetadataFieldsFilter = {
  q?: string;
  name?: string;
  status?: string;
};

export type ListCustomerMetadataFieldsInput = {
  filter?: ListCustomerMetadataFieldsFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListCustomerMetadataFieldsQuery = {
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

const listCustomerMetadataFieldsSchema = Joi.object({
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

export class CustomerMetadataFieldListUseCase extends BaseUseCase<ListCustomerMetadataFieldsInput | void, CustomerMetadataField[], ListCustomerMetadataFieldsQuery> {
  protected async preExec(input?: ListCustomerMetadataFieldsInput | void, actor?: ActivityActor): Promise<ListCustomerMetadataFieldsQuery> {
    const validated = await this.validate<{
      filter?: ListCustomerMetadataFieldsFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listCustomerMetadataFieldsSchema, input ?? {});
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

  protected async execute(context: ListCustomerMetadataFieldsQuery): Promise<CustomerMetadataField[]> {
    const CustomerMetadataFieldModel = await CustomerMetadataFieldModelFactory();
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

    const rows = await CustomerMetadataFieldModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => CustomerMetadataFieldModel.toApi(row.toJSON()));
  }
}
