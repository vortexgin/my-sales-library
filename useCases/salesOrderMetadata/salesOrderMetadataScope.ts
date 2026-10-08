import SalesOrderModelFactory, { SalesOrderModel } from "@/app/sales/models/SalesOrderModel";
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

/** Organization scope resolves through the parent sales order (404 on mismatch, never 403). */
export async function findSalesOrderInScope(
  salesOrderId: string,
  actor: ActivityActor,
): Promise<{ parent: SalesOrderModel; organizationId: string | null }> {
  await SalesOrderModelFactory();
  const order = await SalesOrderModel.findOne({ where: { uuid: salesOrderId, deleted_at: null } });
  if (!order) {
    throw new NotFoundException("Sales order not found.");
  }
  const organizationId = await resolveActorOrganization(actor);
  if ((order.organization_id ?? null) !== organizationId) {
    throw new NotFoundException("Sales order not found.");
  }
  return { parent: order, organizationId: order.organization_id ?? null };
}

export async function assertSalesOrderInScope(salesOrderId: string, actor: ActivityActor): Promise<void> {
  await findSalesOrderInScope(salesOrderId, actor);
}
