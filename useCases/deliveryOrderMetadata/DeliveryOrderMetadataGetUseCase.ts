import Joi from "joi";
import DeliveryOrderMetadataModelFactory, { DeliveryOrderMetadataModel, type DeliveryOrderMetadata } from "@/app/sales/models/DeliveryOrderMetadataModel";
import { assertDeliveryOrderInScope } from "@/app/sales/useCases/deliveryOrderMetadata/deliveryOrderMetadataScope";
import type { ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getDeliveryOrderMetadataSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class DeliveryOrderMetadataGetUseCase extends BaseUseCase<string, DeliveryOrderMetadata | null, string> {

  private deliveryOrderMetadataData?: DeliveryOrderMetadataModel | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getDeliveryOrderMetadataSchema, { uuid });

    await DeliveryOrderMetadataModelFactory();
    this.deliveryOrderMetadataData = await DeliveryOrderMetadataModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.deliveryOrderMetadataData) {
      throw new NotFoundException("Delivery order metadata not found")
    }

    await assertDeliveryOrderInScope(this.deliveryOrderMetadataData.sales_delivery_order_id, actor ?? null);

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<DeliveryOrderMetadata | null> {
    return DeliveryOrderMetadataModel.toApi(this.deliveryOrderMetadataData?.toJSON());
  }
}
