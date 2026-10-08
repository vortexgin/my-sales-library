import PurchaseRequestModelFactory, { PurchaseRequestModel } from "@/app/sales/models/PurchaseRequestModel";
import { UserModel } from "@/app/base/models/UserModel";
import type { ActivityActor } from "@/app/base/models/ActivityLogModel";
import NotFoundException from "@/exceptions/NotFoundException";

export async function resolveActorOrganizationId(actor: ActivityActor): Promise<string | null> {
  const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
  if (typeof actorUuid !== "string") {
    return null;
  }
  return (await UserModel.resolveOrganization(actorUuid))?.uuid ?? null;
}

/**
 * Org scoping via the parent purchase request: unknown parents 404, and a
 * parent owned by another organization 404s (never 403) to avoid leaking
 * cross-org existence. Returns the parent row's organization for writes.
 */
export async function findScopedParent(
  purchaseRequestId: string,
  actor: ActivityActor,
): Promise<{ parent: PurchaseRequestModel; organizationId: string | null }> {
  await PurchaseRequestModelFactory();
  const parent = await PurchaseRequestModel.findOne({ where: { uuid: purchaseRequestId, deleted_at: null } });
  if (!parent) {
    throw new NotFoundException("Purchase request not found.");
  }
  const actorOrganizationId = await resolveActorOrganizationId(actor);
  const parentOrg = parent.organization_id ?? null;
  if (parentOrg !== actorOrganizationId) {
    throw new NotFoundException("Purchase request not found.");
  }
  return { parent, organizationId: parentOrg };
}
