import Joi from "joi";
import CustomerMetadataModelFactory, { CustomerMetadataModel, type CustomerMetadata } from "@/app/sales/models/CustomerMetadataModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const deleteCustomerMetadataSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});
export class CustomerMetadataDeleteUseCase extends BaseUseCase<string, boolean, { uuid: string; actor: ActivityActor }> {

  private customerMetadataData?: CustomerMetadataModel | null;
  private beforeData?: CustomerMetadata | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const validatedUuid = await this.validate<{ uuid: string }>(deleteCustomerMetadataSchema, { uuid });

    await CustomerMetadataModelFactory();
    this.customerMetadataData = await CustomerMetadataModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.customerMetadataData) {
      throw new NotFoundException("Customer metadata not found")
    }
    this.beforeData = CustomerMetadataModel.toApi(this.customerMetadataData?.toJSON());
    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor }): Promise<boolean> {
    const { uuid } = context;
    await CustomerMetadataModelFactory();
    const [affectedRows] = await CustomerMetadataModel.update(
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
        entity: "customer_metadata",
        entity_uuid: context?.uuid ?? null,
        origin: this.beforeData ?? null,
        updated: null,
      });
    }
    return super.postExec(result, context);
  }
}
