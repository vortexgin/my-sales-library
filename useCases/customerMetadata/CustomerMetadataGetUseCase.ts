import Joi from "joi";
import CustomerMetadataModelFactory, { CustomerMetadataModel, type CustomerMetadata } from "@/app/sales/models/CustomerMetadataModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getCustomerMetadataSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class CustomerMetadataGetUseCase extends BaseUseCase<string, CustomerMetadata | null, string> {

  private customerMetadataData?: CustomerMetadataModel | null;

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getCustomerMetadataSchema, { uuid });

    await CustomerMetadataModelFactory();
    this.customerMetadataData = await CustomerMetadataModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.customerMetadataData) {
      throw new NotFoundException("Customer metadata not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<CustomerMetadata | null> {
    return CustomerMetadataModel.toApi(this.customerMetadataData?.toJSON());
  }
}
