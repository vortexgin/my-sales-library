import Joi from "joi";
import CustomerModelFactory, { CustomerModel, type Customer } from "@/app/sales/models/CustomerModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getCustomerSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class CustomerGetUseCase extends BaseUseCase<string, Customer | null, string> {

  private customerData?: CustomerModel | null;

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getCustomerSchema, { uuid });

    await CustomerModelFactory();
    this.customerData = await CustomerModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.customerData) {
      throw new NotFoundException("Customer not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<Customer | null> {
    return CustomerModel.toApi(this.customerData?.toJSON());
  }
}
