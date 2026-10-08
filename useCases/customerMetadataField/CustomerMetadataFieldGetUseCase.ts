import Joi from "joi";
import CustomerMetadataFieldModelFactory, { CustomerMetadataFieldModel, type CustomerMetadataField } from "@/app/sales/models/CustomerMetadataFieldModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getCustomerMetadataFieldSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class CustomerMetadataFieldGetUseCase extends BaseUseCase<string, CustomerMetadataField | null, string> {

  private customerMetadataFieldData?: CustomerMetadataFieldModel | null;

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getCustomerMetadataFieldSchema, { uuid });

    await CustomerMetadataFieldModelFactory();
    this.customerMetadataFieldData = await CustomerMetadataFieldModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.customerMetadataFieldData) {
      throw new NotFoundException("Customer metadata field not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<CustomerMetadataField | null> {
    return CustomerMetadataFieldModel.toApi(this.customerMetadataFieldData?.toJSON());
  }
}
