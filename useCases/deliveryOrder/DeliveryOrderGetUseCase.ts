import Joi from "joi";
import DeliveryOrderModelFactory, { DeliveryOrderModel, type DeliveryOrder } from "@/app/sales/models/DeliveryOrderModel";
import DeliveryOrderItemModelFactory, { DeliveryOrderItemModel } from "@/app/sales/models/DeliveryOrderItemModel";
import SalesOrderModelFactory, { SalesOrderModel } from "@/app/sales/models/SalesOrderModel";
import DeliveryOrderMetadataModelFactory, { DeliveryOrderMetadataModel } from "@/app/sales/models/DeliveryOrderMetadataModel";
import DocMetadataFieldModelFactory, { DocMetadataFieldModel } from "@/app/sales/models/DocMetadataFieldModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getDeliveryOrderSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

/**
 * Relation labels come from eager-loaded associations, not stored snapshots.
 * Sales order is same-module (static import, guarded registration); warehouse
 * and product/variant labels are cross-module (dynamic imports — a missing
 * module degrades to null labels, never fails the lookup).
 */
async function buildRelationIncludes(): Promise<any[]> {
  const includes: any[] = [];
  try {
    await SalesOrderModelFactory();
    const associations = (DeliveryOrderModel as any).associations ?? {};
    if (!associations.sales_order) {
      DeliveryOrderModel.belongsTo(SalesOrderModel, {
        foreignKey: "sales_order_id",
        targetKey: "uuid",
        as: "sales_order",
        constraints: false,
      });
    }
    includes.push({ model: SalesOrderModel, as: "sales_order", required: false });
  } catch {
    // Degrade to a plain row read with a null sales-order label.
  }
  try {
    const { default: WarehouseModelFactory } = await import("@/app/warehouse/models/WarehouseModel");
    const WarehouseModel = await WarehouseModelFactory();
    const associations = (DeliveryOrderModel as any).associations ?? {};
    if (!associations.warehouse) {
      DeliveryOrderModel.belongsTo(WarehouseModel, {
        foreignKey: "warehouse_id",
        targetKey: "uuid",
        as: "warehouse",
        constraints: false,
      });
    }
    includes.push({ model: WarehouseModel, as: "warehouse", required: false });
  } catch {
    // Warehouse module absent — degrade to a null warehouse label.
  }
  return includes;
}

/** Batch-resolves item product/variant labels; missing module → null labels. */
async function resolveItemLabels(items: Array<{ product_id: string; variant_id: string | null }>): Promise<{
  productByUuid: Map<string, { sku: string; name: string }>;
  variantByUuid: Map<string, { sku: string; name: string }>;
}> {
  const empty = { productByUuid: new Map(), variantByUuid: new Map() };
  try {
    const [{ default: ProductModelFactory }, { default: ProductVariantModelFactory }] = await Promise.all([
      import("@/app/product/models/ProductModel"),
      import("@/app/product/models/ProductVariantModel"),
    ]);
    const ProductModel = await ProductModelFactory();
    const ProductVariantModel = await ProductVariantModelFactory();
    const productIds = [...new Set(items.map((item) => item.product_id))];
    const variantIds = [...new Set(items.map((item) => item.variant_id).filter((id): id is string => !!id))];
    const [products, variants] = await Promise.all([
      ProductModel.findAll({ where: { uuid: productIds } }).catch(() => []),
      variantIds.length > 0 ? ProductVariantModel.findAll({ where: { uuid: variantIds } }).catch(() => []) : [],
    ]);
    return {
      productByUuid: new Map(products.map((item) => [item.uuid, { sku: item.sku, name: item.name }])),
      variantByUuid: new Map(variants.map((item) => [item.uuid, { sku: item.sku, name: item.name }])),
    };
  } catch {
    return empty;
  }
}

export class DeliveryOrderGetUseCase extends BaseUseCase<string, DeliveryOrder | null, string> {

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getDeliveryOrderSchema, { uuid });

    await DeliveryOrderModelFactory();
    const row = await DeliveryOrderModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!row) {
      throw new NotFoundException("Delivery order not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(uuid: string): Promise<DeliveryOrder | null> {
    await DeliveryOrderModelFactory();
    const row = await DeliveryOrderModel.findOne({
      where: { uuid, deleted_at: null },
      include: await buildRelationIncludes(),
    });
    if (!row) {
      return null;
    }

    await DeliveryOrderItemModelFactory();
    const items = await DeliveryOrderItemModel.findAll({
      where: { delivery_order_id: uuid, deleted_at: null },
      order: [["created_at", "ASC"]],
    });
    const { productByUuid, variantByUuid } = await resolveItemLabels(items);

    await DeliveryOrderMetadataModelFactory();
    const metadataRows = await DeliveryOrderMetadataModel.findAll({
      where: { sales_delivery_order_id: uuid, deleted_at: null },
      order: [["created_at", "ASC"]],
    });
    let fieldNames = new Map<string, string>();
    try {
      await DocMetadataFieldModelFactory();
      const fieldIds = [...new Set(metadataRows.map((metadata) => metadata.sales_doc_metadata_field_id))];
      const fields = fieldIds.length > 0
        ? await DocMetadataFieldModel.findAll({ where: { uuid: fieldIds } })
        : [];
      fieldNames = new Map(fields.map((field) => [field.uuid, field.name]));
    } catch {
      // Metadata remains usable with field UUID fallback if field lookup fails.
    }

    return {
      ...DeliveryOrderModel.toApi(row.toJSON()),
      items: items.map((item) => {
        const product = productByUuid.get(item.product_id);
        const variant = item.variant_id ? variantByUuid.get(item.variant_id) : undefined;
        return DeliveryOrderItemModel.toApi({
          ...item.toJSON(),
          product_sku: product?.sku ?? null,
          product_name: product?.name ?? null,
          variant_sku: variant?.sku ?? null,
          variant_name: variant?.name ?? null,
        });
      }),
      metadata: metadataRows.map((metadata) => ({
        ...DeliveryOrderMetadataModel.toApi(metadata.toJSON()),
        field_name: fieldNames.get(metadata.sales_doc_metadata_field_id),
      })),
    };
  }
}
