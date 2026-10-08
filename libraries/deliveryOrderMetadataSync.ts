import { randomUUID } from "crypto";
import { UniqueConstraintError } from "sequelize";
import DeliveryOrderMetadataModelFactory, { DeliveryOrderMetadataModel } from "@/app/sales/models/DeliveryOrderMetadataModel";
import DocMetadataFieldModelFactory, { DocMetadataFieldModel } from "@/app/sales/models/DocMetadataFieldModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import BadParameterException from "@/exceptions/BadParameterException";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";
import NotFoundException from "@/exceptions/NotFoundException";

export type DeliveryOrderMetadataNestedItem = {
  uuid?: string;
  sales_doc_metadata_field_id?: string;
  field_name?: string;
  value: string;
};

async function resolveFieldId(
  item: DeliveryOrderMetadataNestedItem,
  organizationId: string | null,
  actor: ActivityActor,
): Promise<string | null> {
  if (item.sales_doc_metadata_field_id) {
    await DocMetadataFieldModelFactory();
    const field = await DocMetadataFieldModel.findOne({
      where: { uuid: item.sales_doc_metadata_field_id, organization_id: organizationId, deleted_at: null },
    });
    if (!field) {
      throw new NotFoundException("Doc metadata field not found.");
    }
    return field.uuid;
  }

  const name = item.field_name?.trim();
  if (!name) {
    return null;
  }

  await DocMetadataFieldModelFactory();
  const existing = await DocMetadataFieldModel.findOne({
    where: { organization_id: organizationId, name, deleted_at: null },
  });
  if (existing) {
    return existing.uuid;
  }

  let created;
  try {
    created = await DocMetadataFieldModel.create({
      uuid: randomUUID(),
      organization_id: organizationId ?? null,
      name,
      description: name,
      status: "active",
      deleted_at: null,
    });
  } catch (error) {
    if (!(error instanceof UniqueConstraintError)) {
      throw error;
    }
    const raced = await DocMetadataFieldModel.findOne({
      where: { organization_id: organizationId, name, deleted_at: null },
    });
    if (!raced) {
      throw error;
    }
    return raced.uuid;
  }
  void recordActivityLog({
    actor: actor ?? null,
    operation: "create",
    entity: "doc_metadata_field",
    entity_uuid: created.uuid,
    origin: null,
    updated: { uuid: created.uuid, name } as unknown as Record<string, unknown>,
  });
  return created.uuid;
}

/**
 * Full-replacement sync within one delivery-order scope: items with uuid update
 * the matching row, new items insert (reusing the sync identity when a resubmit
 * names an existing field), omitted rows soft-delete.
 */
export async function syncDeliveryOrderMetadata(
  deliveryOrderId: string,
  items: DeliveryOrderMetadataNestedItem[] | undefined,
  organizationId: string | null,
  actor: ActivityActor,
): Promise<void> {
  await DeliveryOrderMetadataModelFactory();
  const existing = await DeliveryOrderMetadataModel.findAll({
    where: { sales_delivery_order_id: deliveryOrderId, deleted_at: null },
  });
  const byUuid = new Map(existing.map((row) => [row.uuid, row]));
  const identityOf = (fieldId: string) => fieldId;
  const byIdentity = new Map(existing.map((row) => [identityOf(row.sales_doc_metadata_field_id), row]));
  const seen = new Set<string>();
  const seenIdentity = new Set<string>();

  for (const item of items ?? []) {
    if (item.uuid) {
      const row = byUuid.get(item.uuid);
      if (!row) {
        throw new BadParameterException("Delivery order metadata row does not belong to this delivery order.");
      }
      const fieldId = item.sales_doc_metadata_field_id || item.field_name
        ? await resolveFieldId(item, organizationId, actor)
        : row.sales_doc_metadata_field_id;
      if (!fieldId) {
        throw new BadParameterException("Delivery order metadata field is required.");
      }
      if (seenIdentity.has(identityOf(fieldId))) {
        throw new DuplicateEntityException("Duplicate delivery order metadata row.");
      }
      seenIdentity.add(identityOf(fieldId));
      seen.add(item.uuid);
      await row.update({
        sales_doc_metadata_field_id: fieldId,
        value: item.value?.trim(),
        status: "active",
        deleted_at: null,
        updated_at: new Date(),
      });
      continue;
    }

    const fieldId = await resolveFieldId(item, organizationId, actor);
    if (!fieldId) {
      continue;
    }
    if (seenIdentity.has(identityOf(fieldId))) {
      throw new DuplicateEntityException("Duplicate delivery order metadata row.");
    }
    seenIdentity.add(identityOf(fieldId));

    const same = byIdentity.get(identityOf(fieldId));
    if (same) {
      seen.add(same.uuid);
      await same.update({ value: item.value?.trim(), updated_at: new Date() });
      continue;
    }

    try {
      const row = await DeliveryOrderMetadataModel.create({
        uuid: randomUUID(),
        sales_delivery_order_id: deliveryOrderId,
        sales_doc_metadata_field_id: fieldId,
        value: item.value?.trim(),
        status: "active",
        deleted_at: null,
      });
      seen.add(row.uuid);
      void recordActivityLog({
        actor: actor ?? null,
        operation: "create",
        entity: "delivery_order_metadata",
        entity_uuid: row.uuid,
        origin: null,
        updated: DeliveryOrderMetadataModel.toApi(row.toJSON()) as unknown as Record<string, unknown>,
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("Duplicate delivery order metadata row.");
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
