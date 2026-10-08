import Joi from "joi";
import SalesOrderMetadataModelFactory, { SalesOrderMetadataModel, type SalesOrderMetadata } from "@/app/sales/models/SalesOrderMetadataModel";
import { assertSalesOrderInScope } from "@/app/sales/useCases/salesOrderMetadata/salesOrderMetadataScope";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getSalesOrderMetadataSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class SalesOrderMetadataGetUseCase extends BaseUseCase<string, SalesOrderMetadata | null, string> {

  private salesOrderMetadataData?: SalesOrderMetadataModel | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getSalesOrderMetadataSchema, { uuid });

    await SalesOrderMetadataModelFactory();
    this.salesOrderMetadataData = await SalesOrderMetadataModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.salesOrderMetadataData) {
      throw new NotFoundException("Sales order metadata not found")
    }

    await assertSalesOrderInScope(this.salesOrderMetadataData.sales_order_id, actor ?? null);

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<SalesOrderMetadata | null> {
    return SalesOrderMetadataModel.toApi(this.salesOrderMetadataData?.toJSON());
  }
}
