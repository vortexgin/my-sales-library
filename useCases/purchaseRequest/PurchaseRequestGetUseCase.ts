import Joi from "joi";
import PurchaseRequestModelFactory, { PurchaseRequestModel, type PurchaseRequest } from "@/app/sales/models/PurchaseRequestModel";
import PurchaseRequestItemModelFactory, { PurchaseRequestItemModel } from "@/app/sales/models/PurchaseRequestItemModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getPurchaseRequestSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class PurchaseRequestGetUseCase extends BaseUseCase<string, (PurchaseRequest & { items: unknown[] }) | null, string> {

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getPurchaseRequestSchema, { uuid });

    await PurchaseRequestModelFactory();
    const row = await PurchaseRequestModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!row) {
      throw new NotFoundException("Purchase request not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(uuid: string): Promise<(PurchaseRequest & { items: unknown[] }) | null> {
    await PurchaseRequestModelFactory();
    const row = await PurchaseRequestModel.findOne({ where: { uuid, deleted_at: null } });
    if (!row) {
      return null;
    }

    await PurchaseRequestItemModelFactory();
    const items = await PurchaseRequestItemModel.findAll({
      where: { purchase_request_id: uuid, deleted_at: null },
      order: [["created_at", "ASC"]],
    });

    return {
      ...PurchaseRequestModel.toApi(row.toJSON()),
      items: items.map((item) => PurchaseRequestItemModel.toApi(item.toJSON())),
    };
  }
}
