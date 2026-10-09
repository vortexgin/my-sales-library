import Joi from "joi";
import PosTransactionModelFactory, { PosTransactionModel, type PosTransaction } from "@/app/sales/models/PosTransactionModel";
import CustomerModelFactory, { CustomerModel } from "@/app/sales/models/CustomerModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { sendPosReceiptEmail } from "@/libraries/mail";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import { buildReceipt } from "@/app/sales/useCases/posTransaction/PosTransactionCreateUseCase";
import { PosTransactionGetUseCase } from "@/app/sales/useCases/posTransaction/PosTransactionGetUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";

/**
 * Re-sends a completed sale's receipt email (walk-ins have no address).
 * Reprint never re-settles billing; re-email only stamps receipt_sent_at.
 */
export class PosTransactionSendReceiptUseCase extends BaseUseCase<string, PosTransaction, { uuid: string; actor: ActivityActor }> {
  private transactionData?: PosTransactionModel | null;
  private beforeData?: PosTransaction | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const uuidSchema = Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() });
    const validated = await this.validate<{ uuid: string }>(uuidSchema, { uuid });
    const validatedUuid = validated.uuid;

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await PosTransactionModelFactory();
    this.transactionData = await PosTransactionModel.findOne({
      where: { uuid: validatedUuid, deleted_at: null },
    });
    if (!this.transactionData || (this.transactionData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("POS transaction not found.");
    }
    this.beforeData = PosTransactionModel.toApi(this.transactionData.toJSON());

    if (this.beforeData.status !== "completed") {
      throw new BadParameterException("Receipts can only be re-sent for completed sales.");
    }
    if (!this.beforeData.customer_id) {
      throw new BadParameterException("Walk-in sales have no email address. Use print instead.");
    }

    return { uuid: validatedUuid, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor }): Promise<PosTransaction> {
    const before = this.beforeData as PosTransaction;

    await CustomerModelFactory();
    const customer = await CustomerModel.findOne({ where: { uuid: before.customer_id as string, deleted_at: null } });
    const email = customer?.email?.trim() || "";
    if (!email) {
      throw new BadParameterException("The linked customer has no email address.");
    }

    const detail = await new PosTransactionGetUseCase().exec(context.uuid, context.actor);
    const receipt = buildReceipt(detail, detail.items, {
      actor: context.actor,
      organizationId: before.organization_id,
    });
    const sent = await sendPosReceiptEmail(email, receipt);
    if (!sent) {
      throw new BadParameterException("Receipt email could not be sent. Sale stays completed with email pending.");
    }

    await this.transactionData?.update({ receipt_sent_at: new Date(), updated_at: new Date() });
    return PosTransactionModel.toApi(this.transactionData?.toJSON());
  }

  protected async postExec(
    result: PosTransaction,
    context?: { uuid: string; actor: ActivityActor },
  ): Promise<PosTransaction> {
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
