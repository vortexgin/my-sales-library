import Joi from "joi";
import { Op } from "sequelize";
import CustomerModelFactory, { type Customer } from "@/app/sales/models/CustomerModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { escapeLike } from "@/libraries/String";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListCustomersFilter = {
  q?: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
};

export type ListCustomersInput = {
  filter?: ListCustomersFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListCustomersQuery = {
  q?: string;
  name?: string;
  email?: string;
  phone?: string;
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
  email: "email",
  phone: "phone",
  status: "status",
  created_at: "created_at",
  updated_at: "updated_at",
};

const listCustomersSchema = Joi.object({
  filter: Joi.object({
    q: Joi.string().trim().allow("").optional(),
    name: Joi.string().trim().allow("").optional(),
    email: Joi.string().trim().allow("").optional(),
    phone: Joi.string().trim().allow("").optional(),
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

export class CustomerListUseCase extends BaseUseCase<ListCustomersInput | void, Customer[], ListCustomersQuery> {
  protected async preExec(input?: ListCustomersInput | void, actor?: ActivityActor): Promise<ListCustomersQuery> {
    const validated = await this.validate<{
      filter?: ListCustomersFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listCustomersSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      q: filter.q?.trim() || undefined,
      name: filter.name?.trim() || undefined,
      email: filter.email?.trim().toLowerCase() || undefined,
      phone: filter.phone?.trim() || undefined,
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

  protected async execute(context: ListCustomersQuery): Promise<Customer[]> {
    const CustomerModel = await CustomerModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }];

    if (context.email) {
      conditions.push({ email: context.email });
    }

    if (context.phone) {
      conditions.push({ phone: context.phone });
    }

    if (context.status) {
      conditions.push({ status: context.status });
    }

    if (context.name) {
      conditions.push({ name: { [Op.iLike]: `%${escapeLike(context.name)}%` } });
    }

    if (context.q) {
      const pattern = `%${escapeLike(context.q)}%`;
      conditions.push({
        [Op.or]: [
          { name: { [Op.iLike]: pattern } },
          { email: { [Op.iLike]: pattern } },
          { phone: { [Op.iLike]: pattern } },
          { company_name: { [Op.iLike]: pattern } },
        ],
      });
    }

    await this.applyOrganizationScope(conditions, context.actor);

    const rows = await CustomerModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    return rows.map((row) => CustomerModel.toApi(row.toJSON()));
  }
}
