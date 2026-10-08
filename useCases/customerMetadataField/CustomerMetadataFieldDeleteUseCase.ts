import Joi from "joi";
import CustomerMetadataFieldModelFactory, { CustomerMetadataFieldModel, type CustomerMetadataField } from "@/app/sales/models/CustomerMetadataFieldModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const deleteCustomerMetadataFieldSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});
export class CustomerMetadataFieldDeleteUseCase extends BaseUseCase<string, boolean, { uuid: string; actor: ActivityActor }> {

  private customerMetadataFieldData?: CustomerMetadataFieldModel | null;
  private beforeData?: CustomerMetadataField | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const validatedUuid = await this.validate<{ uuid: string }>(deleteCustomerMetadataFieldSchema, { uuid });

    await CustomerMetadataFieldModelFactory();
    this.customerMetadataFieldData = await CustomerMetadataFieldModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.customerMetadataFieldData) {
      throw new NotFoundException("Customer metadata field not found")
    }
    this.beforeData = CustomerMetadataFieldModel.toApi(this.customerMetadataFieldData?.toJSON());
    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor }): Promise<boolean> {
    const { uuid } = context;
    await CustomerMetadataFieldModelFactory();
    const [affectedRows] = await CustomerMetadataFieldModel.update(
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
        entity: "customer_metadata_field",
        entity_uuid: context?.uuid ?? null,
        origin: this.beforeData ?? null,
        updated: null,
      });
    }
    return super.postExec(result, context);
  }
}
