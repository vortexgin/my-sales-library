import Joi from "joi";
import PosTransactionModelFactory, { PosTransactionModel, type PosTransaction } from "@/app/sales/models/PosTransactionModel";
import PosTransactionItemModelFactory, { PosTransactionItemModel } from "@/app/sales/models/PosTransactionItemModel";
import { insertMovementRow } from "@/app/warehouse/libraries/insertMovementRow";
import { getSequelizeInstance } from "@/database/sequelize";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";

const voidPosTransactionSchema = Joi.object({
  reason: Joi.string().trim().min(2).max(500).required(),
}).unknown(false);

export class PosTransactionVoidUseCase extends BaseUseCase<string, PosTransaction, { uuid: string; input: { reason: string }; actor: ActivityActor }> {
  private transactionData?: PosTransactionModel | null;
  private beforeData?: PosTransaction | null;

  protected async preExec(uuid: string, input: { reason: string }, actor?: ActivityActor): Promise<{ uuid: string; input: { reason: string }; actor: ActivityActor }> {
    const validatedInput = await this.validate<{ reason: string }>(voidPosTransactionSchema, input ?? {});

    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validatedUuid = await this.validate<{ uuid: string }>(uuidSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await PosTransactionModelFactory();
    this.transactionData = await PosTransactionModel.findOne({
      where: { uuid: validatedUuid.uuid, deleted_at: null },
    });
    if (!this.transactionData || (this.transactionData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("POS transaction not found.");
    }
    this.beforeData = PosTransactionModel.toApi(this.transactionData.toJSON());

    if (this.beforeData.status !== "completed") {
      throw new BadParameterException("Only a completed sale can be voided.");
    }

    return { uuid: validatedUuid.uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: { reason: string }; actor: ActivityActor }): Promise<PosTransaction> {
    const { input } = context;
    const before = this.beforeData as PosTransaction;
    const organizationId = before.organization_id;

    await PosTransactionItemModelFactory();
    const items = await PosTransactionItemModel.findAll({
      where: { transaction_id: context.uuid, deleted_at: null },
      order: [["created_at", "ASC"]],
    });

    const sequelize = await getSequelizeInstance();
    await sequelize.transaction(async (transaction: any) => {
      // Counter inventory correction for system-posted sales; paper voids
      // just flip status (nothing was ever deducted).
      if (before.stock_deducted) {
        for (const item of items) {
          await insertMovementRow(
            {
              warehouse_id: before.warehouse_id,
              product_id: item.product_id,
              variant_id: item.variant_id,
              type: "in",
              qty: item.qty,
              ref_type: "pos-void",
              ref_id: before.uuid,
              notes: input.reason.trim(),
            },
            organizationId,
            { transaction },
          );
        }
      }

      await this.transactionData?.update(
        { status: "voided", void_reason: input.reason.trim(), updated_at: new Date() },
        { transaction },
      );
    });

    return PosTransactionModel.toApi(this.transactionData?.toJSON());
  }

  protected async postExec(
    result: PosTransaction,
    context?: { uuid: string; input: { reason: string }; actor: ActivityActor },
  ): Promise<PosTransaction> {
    // Void is an inventory correction, not new money: plain log, no settle.
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "pos_transaction",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
