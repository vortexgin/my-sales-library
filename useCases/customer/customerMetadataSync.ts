import { randomUUID } from "crypto";
import { UniqueConstraintError } from "sequelize";
import CustomerMetadataModelFactory, { CustomerMetadataModel } from "@/app/sales/models/CustomerMetadataModel";
import CustomerMetadataFieldModelFactory, { CustomerMetadataFieldModel } from "@/app/sales/models/CustomerMetadataFieldModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import BadParameterException from "@/exceptions/BadParameterException";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";
import NotFoundException from "@/exceptions/NotFoundException";

export type CustomerMetadataNestedItem = {
  uuid?: string;
  customer_metadata_field_id?: string;
  field_name?: string;
  value: string;
};

async function resolveFieldId(
  item: CustomerMetadataNestedItem,
  organizationId: string | null,
  actor: ActivityActor,
): Promise<string | null> {
  if (item.customer_metadata_field_id) {
    await CustomerMetadataFieldModelFactory();
    const field = await CustomerMetadataFieldModel.findOne({
      where: { uuid: item.customer_metadata_field_id, deleted_at: null },
    });
    if (!field) {
      throw new NotFoundException("Customer metadata field not found.");
    }
    return field.uuid;
  }

  const name = item.field_name?.trim();
  if (!name) {
    return null;
  }

  await CustomerMetadataFieldModelFactory();
  const existing = await CustomerMetadataFieldModel.findOne({
    where: { organization_id: organizationId, name, deleted_at: null },
  });
  if (existing) {
    return existing.uuid;
  }

  const created = await CustomerMetadataFieldModel.create({
    uuid: randomUUID(),
    organization_id: organizationId ?? null,
    name,
    description: name,
    status: "active",
    deleted_at: null,
  });
  void recordActivityLog({
    actor: actor ?? null,
    operation: "create",
    entity: "customer_metadata_field",
    entity_uuid: created.uuid,
    origin: null,
    updated: { uuid: created.uuid, name } as unknown as Record<string, unknown>,
  });
  return created.uuid;
}

/**
 * Full-replacement sync within one customer scope: items with uuid update the
 * matching row, new items insert (reusing the sync identity when a resubmit
 * names an existing field), omitted rows soft-delete.
 */
export async function syncCustomerMetadata(
  customerId: string,
  items: CustomerMetadataNestedItem[] | undefined,
  organizationId: string | null,
  actor: ActivityActor,
): Promise<void> {
  await CustomerMetadataModelFactory();
  const existing = await CustomerMetadataModel.findAll({
    where: { customer_id: customerId, deleted_at: null },
  });
  const byUuid = new Map(existing.map((row) => [row.uuid, row]));
  const identityOf = (fieldId: string) => fieldId;
  const byIdentity = new Map(existing.map((row) => [identityOf(row.customer_metadata_field_id), row]));
  const seen = new Set<string>();
  const seenIdentity = new Set<string>();

  for (const item of items ?? []) {
    if (item.uuid) {
      const row = byUuid.get(item.uuid);
      if (!row) {
        throw new BadParameterException("Customer metadata row does not belong to this customer.");
      }
      seen.add(item.uuid);
      await row.update({ value: item.value?.trim(), updated_at: new Date() });
      continue;
    }

    const fieldId = await resolveFieldId(item, organizationId, actor);
    if (!fieldId) {
      continue;
    }
    if (seenIdentity.has(identityOf(fieldId))) {
      throw new DuplicateEntityException("Duplicate customer metadata row.");
    }
    seenIdentity.add(identityOf(fieldId));

    const same = byIdentity.get(identityOf(fieldId));
    if (same) {
      seen.add(same.uuid);
      await same.update({ value: item.value?.trim(), updated_at: new Date() });
      continue;
    }

    try {
      const row = await CustomerMetadataModel.create({
        uuid: randomUUID(),
        customer_id: customerId,
        customer_metadata_field_id: fieldId,
        value: item.value?.trim(),
        status: "active",
        deleted_at: null,
      });
      seen.add(row.uuid);
      void recordActivityLog({
        actor: actor ?? null,
        operation: "create",
        entity: "customer_metadata",
        entity_uuid: row.uuid,
        origin: null,
        updated: CustomerMetadataModel.toApi(row.toJSON()) as unknown as Record<string, unknown>,
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("Duplicate customer metadata row.");
      }
      throw error;
    }
  }

  for (const row of existing) {
    if (!seen.has(row.uuid)) {
      await row.update({ status: "deleted", deleted_at: new Date(), updated_at: new Date() });
    }
  }
}
