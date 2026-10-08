import Joi from "joi";
import CustomerActivityModelFactory, { CustomerActivityModel, type CustomerActivity } from "@/app/sales/models/CustomerActivityModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getCustomerActivitySchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class CustomerActivityGetUseCase extends BaseUseCase<string, CustomerActivity | null, string> {

  private customerActivityData?: CustomerActivityModel | null;

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getCustomerActivitySchema, { uuid });

    await CustomerActivityModelFactory();
    this.customerActivityData = await CustomerActivityModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.customerActivityData) {
      throw new NotFoundException("Customer activity not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<CustomerActivity | null> {
    return CustomerActivityModel.toApi(this.customerActivityData?.toJSON());
  }
}
