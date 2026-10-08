import DeliveryOrderModelFactory, { DeliveryOrderModel } from "@/app/sales/models/DeliveryOrderModel";
import { UserModel } from "@/app/base/models/UserModel";
import type { ActivityActor } from "@/app/base/models/ActivityLogModel";
import NotFoundException from "@/exceptions/NotFoundException";

export async function resolveActorOrganization(actor: ActivityActor): Promise<string | null> {
  const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
  if (typeof actorUuid !== "string") {
    return null;
  }
  return (await UserModel.resolveOrganization(actorUuid))?.uuid ?? null;
}

/** Organization scope resolves through the parent delivery order (404 on mismatch). */
export async function findDeliveryOrderInScope(
  deliveryOrderId: string,
  actor: ActivityActor,
): Promise<{ parent: DeliveryOrderModel; organizationId: string | null }> {
  await DeliveryOrderModelFactory();
  const order = await DeliveryOrderModel.findOne({ where: { uuid: deliveryOrderId, deleted_at: null } });
  if (!order) {
    throw new NotFoundException("Delivery order not found.");
  }
  const organizationId = await resolveActorOrganization(actor);
  if ((order.organization_id ?? null) !== organizationId) {
    throw new NotFoundException("Delivery order not found.");
  }
  return { parent: order, organizationId: order.organization_id ?? null };
}

export async function assertDeliveryOrderInScope(deliveryOrderId: string, actor: ActivityActor): Promise<void> {
  await findDeliveryOrderInScope(deliveryOrderId, actor);
}
