import Joi from "joi";
import { Op } from "sequelize";
import PosTransactionModelFactory, { type PosTransaction } from "@/app/sales/models/PosTransactionModel";
import { customerNameById } from "@/app/sales/libraries/customerLabels";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";

export type ListPosTransactionsFilter = {
  session_id?: string;
  status?: string;
};

export type ListPosTransactionsInput = {
  filter?: ListPosTransactionsFilter;
  sortProperty?: string;
  sortDirection?: string;
  offset?: unknown;
  limit?: unknown;
};

export type ListPosTransactionsQuery = {
  session_id?: string;
  status?: string;
  sortProperty: string;
  sortDirection: "ASC" | "DESC";
  offset: number;
  limit: number;
  actor: ActivityActor;
};

const SORTABLE_COLUMNS: Record<string, string> = {
  uuid: "uuid",
  receipt_no: "receipt_no",
  status: "status",
  created_at: "created_at",
  updated_at: "updated_at",
};

const listPosTransactionsSchema = Joi.object({
  filter: Joi.object({
    session_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
    status: Joi.string().valid("completed", "voided").allow("").optional(),
  }).optional(),
  sortProperty: Joi.string()
    .valid(...Object.keys(SORTABLE_COLUMNS))
    .insensitive()
    .default("created_at"),
  sortDirection: Joi.string().valid("asc", "desc").insensitive().default("desc"),
  offset: Joi.number().integer().min(0).default(0),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export class PosTransactionListUseCase extends BaseUseCase<ListPosTransactionsInput | void, PosTransaction[], ListPosTransactionsQuery> {
  protected async preExec(input?: ListPosTransactionsInput | void, actor?: ActivityActor): Promise<ListPosTransactionsQuery> {
    const validated = await this.validate<{
      filter?: ListPosTransactionsFilter;
      sortProperty: string;
      sortDirection: string;
      offset: number;
      limit: number;
    }>(listPosTransactionsSchema, input ?? {});
    const filter = validated.filter ?? {};

    return {
      session_id: filter.session_id || undefined,
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

  protected async execute(context: ListPosTransactionsQuery): Promise<PosTransaction[]> {
    const PosTransactionModel = await PosTransactionModelFactory();
    const conditions: Record<string, unknown>[] = [{ deleted_at: null }];

    if (context.session_id) {
      conditions.push({ session_id: context.session_id });
    }

    if (context.status) {
      conditions.push({ status: context.status });
    }

    await this.applyOrganizationScope(conditions, context.actor);

    const rows = await PosTransactionModel.findAll({
      where: { [Op.and]: conditions },
      order: [[context.sortProperty, context.sortDirection]],
      offset: context.offset,
      limit: context.limit,
    });

    const names = await customerNameById(rows.map((row) => row.customer_id).filter((id): id is string => !!id));
    return rows.map((row) => {
      const json = row.toJSON() as Record<string, unknown>;
      const customerId = row.customer_id;
      const name = customerId ? names.get(customerId) : undefined;
      return PosTransactionModel.toApi(
        name && customerId ? { ...json, customer: { uuid: customerId, name, email: "" } } : json,
      );
    });
  }
}
