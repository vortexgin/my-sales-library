import Joi from "joi";
import DeliveryOrderModelFactory, { DeliveryOrderModel, type DeliveryOrder, type UpdateDeliveryOrderInput } from "@/app/sales/models/DeliveryOrderModel";
import DeliveryOrderItemModelFactory, { DeliveryOrderItemModel } from "@/app/sales/models/DeliveryOrderItemModel";
import { syncDeliveryOrderMetadata, type DeliveryOrderMetadataNestedItem } from "@/app/sales/libraries/deliveryOrderMetadataSync";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import BadParameterException from "@/exceptions/BadParameterException";
import NotFoundException from "@/exceptions/NotFoundException";

const deliveryOrderMetadataNestedSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).optional(),
  sales_doc_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  field_name: Joi.string().trim().min(2).max(160).optional(),
  value: Joi.string().trim().min(1).required(),
}).or("uuid", "sales_doc_metadata_field_id", "field_name");

const updateDeliveryOrderSchema = Joi.object({
  notes: Joi.string().trim().allow("", null).optional(),
  status: Joi.string().valid("draft", "packed", "delivered", "cancelled").optional(),
  metadata: Joi.array().items(deliveryOrderMetadataNestedSchema).max(100).optional(),
}).unknown(false).min(1);

export class DeliveryOrderUpdateUseCase extends BaseUseCase<string, DeliveryOrder, { uuid: string; input: UpdateDeliveryOrderInput; actor: ActivityActor }> {

  private deliveryOrderData?: DeliveryOrderModel | null;
  private beforeData?: DeliveryOrder | null;

  protected async preExec(uuid: string, input: UpdateDeliveryOrderInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateDeliveryOrderInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateDeliveryOrderInput>(updateDeliveryOrderSchema, input);

    await DeliveryOrderModelFactory();
    this.deliveryOrderData = await DeliveryOrderModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.deliveryOrderData) {
      throw new NotFoundException("Delivery order not found")
    }
    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId = typeof actorUuid === "string"
      ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null)
      : null;
    if ((this.deliveryOrderData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Delivery order not found");
    }
    this.beforeData = DeliveryOrderModel.toApi(this.deliveryOrderData?.toJSON());

    const nextStatus = (validatedInput as { status?: string }).status;
    if (typeof nextStatus === "string" && nextStatus && nextStatus !== this.beforeData.status) {
      // `shipped` is set only through the ship endpoint; `delivered` is
      // reachable only from a shipped order; terminal states are read-only.
      if (this.beforeData.status === "shipped") {
        if (nextStatus !== "delivered") {
          throw new BadParameterException("Shipped orders change only through the ship endpoint.");
        }
      } else if (["delivered", "cancelled"].includes(this.beforeData.status)) {
        throw new BadParameterException(`Cannot move a ${this.beforeData.status} delivery order to ${nextStatus}.`);
      } else if (nextStatus === "delivered") {
        throw new BadParameterException("Only a shipped delivery order can be marked delivered.");
      }
    } else if (["shipped", "delivered"].includes(this.beforeData.status)) {
      throw new BadParameterException("Shipped orders change only through the ship endpoint.");
    }

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateDeliveryOrderInput; actor: ActivityActor }): Promise<DeliveryOrder> {
    const { input } = context;
    const nextData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (Object.prototype.hasOwnProperty.call(input, "notes")) {
      nextData.notes = (input.notes as string | null)?.trim() || null;
    }

    if (typeof input.status === "string" && input.status) {
      nextData.status = input.status;
    }

    await this.deliveryOrderData?.update(nextData);

    // Metadata sync is independent of the fixed items: notes/status rules
    // above are untouched, omitted metadata rows soft-delete on replacement.
    if (Object.prototype.hasOwnProperty.call(input, "metadata")) {
      const api = DeliveryOrderModel.toApi(this.deliveryOrderData?.toJSON());
      await syncDeliveryOrderMetadata(
        context.uuid,
        input.metadata as DeliveryOrderMetadataNestedItem[] | undefined,
        api.organization_id,
        context.actor,
      );
    }

    await DeliveryOrderItemModelFactory();
    const items = await DeliveryOrderItemModel.findAll({
      where: { delivery_order_id: context.uuid, deleted_at: null },
      order: [["created_at", "ASC"]],
    });

    return {
      ...DeliveryOrderModel.toApi(this.deliveryOrderData?.toJSON()),
      items: items.map((item) => DeliveryOrderItemModel.toApi(item.toJSON())),
    } as DeliveryOrder;
  }

  protected async postExec(
    result: DeliveryOrder,
    context?: { uuid: string; input: UpdateDeliveryOrderInput; actor: ActivityActor },
  ): Promise<DeliveryOrder> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "delivery_order",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result as unknown as Record<string, unknown>,
    });
    return super.postExec(result, context);
  }
}
