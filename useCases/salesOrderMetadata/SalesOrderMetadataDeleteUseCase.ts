import Joi from "joi";
import SalesOrderMetadataModelFactory, { SalesOrderMetadataModel, type SalesOrderMetadata } from "@/app/sales/models/SalesOrderMetadataModel";
import { assertSalesOrderInScope } from "@/app/sales/useCases/salesOrderMetadata/salesOrderMetadataScope";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const deleteSalesOrderMetadataSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});
export class SalesOrderMetadataDeleteUseCase extends BaseUseCase<string, boolean, { uuid: string; actor: ActivityActor }> {

  private salesOrderMetadataData?: SalesOrderMetadataModel | null;
  private beforeData?: SalesOrderMetadata | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const validatedUuid = await this.validate<{ uuid: string }>(deleteSalesOrderMetadataSchema, { uuid });

    await SalesOrderMetadataModelFactory();
    this.salesOrderMetadataData = await SalesOrderMetadataModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.salesOrderMetadataData) {
      throw new NotFoundException("Sales order metadata not found")
    }
    this.beforeData = SalesOrderMetadataModel.toApi(this.salesOrderMetadataData?.toJSON());

    await assertSalesOrderInScope(this.salesOrderMetadataData.sales_order_id, actor ?? null);

    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor }): Promise<boolean> {
    const { uuid } = context;
    await SalesOrderMetadataModelFactory();
    const [affectedRows] = await SalesOrderMetadataModel.update(
      {
        status: "deleted",
        deleted_at: new Date(),
        updated_at: new Date(),
      },
      {
        where: { uuid, deleted_at: null },
      },
    );

    return affectedRows > 0;
  }

  protected async postExec(
    result: boolean,
    context?: { uuid: string; actor: ActivityActor },
  ): Promise<boolean> {
    if (result) {
      void recordActivityLog({
        actor: context?.actor ?? null,
        operation: "delete",
        entity: "sales_order_metadata",
        entity_uuid: context?.uuid ?? null,
        origin: this.beforeData ?? null,
        updated: null,
      });
    }
    return super.postExec(result, context);
  }
}
