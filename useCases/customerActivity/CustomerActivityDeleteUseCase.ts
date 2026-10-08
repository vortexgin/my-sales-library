import Joi from "joi";
import CustomerActivityModelFactory, { CustomerActivityModel, type CustomerActivity } from "@/app/sales/models/CustomerActivityModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const deleteCustomerActivitySchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});
export class CustomerActivityDeleteUseCase extends BaseUseCase<string, boolean, { uuid: string; actor: ActivityActor }> {

  private customerActivityData?: CustomerActivityModel | null;
  private beforeData?: CustomerActivity | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<{ uuid: string; actor: ActivityActor }> {
    const validatedUuid = await this.validate<{ uuid: string }>(deleteCustomerActivitySchema, { uuid });

    await CustomerActivityModelFactory();
    this.customerActivityData = await CustomerActivityModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.customerActivityData) {
      throw new NotFoundException("Customer activity not found")
    }
    this.beforeData = CustomerActivityModel.toApi(this.customerActivityData?.toJSON());
    return { uuid: validatedUuid.uuid, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; actor: ActivityActor }): Promise<boolean> {
    const { uuid } = context;
    await CustomerActivityModelFactory();
    const [affectedRows] = await CustomerActivityModel.update(
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
        entity: "customer_activity",
        entity_uuid: context?.uuid ?? null,
        origin: this.beforeData ?? null,
        updated: null,
      });
    }
    return super.postExec(result, context);
  }
}
