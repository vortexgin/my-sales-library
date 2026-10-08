import Joi from "joi";
import SalesOrderModelFactory, { SalesOrderModel, type SalesOrder } from "@/app/sales/models/SalesOrderModel";
import SalesOrderItemModelFactory, { SalesOrderItemModel } from "@/app/sales/models/SalesOrderItemModel";
import CustomerModelFactory, { CustomerModel } from "@/app/sales/models/CustomerModel";
import PurchaseRequestModelFactory, { PurchaseRequestModel } from "@/app/sales/models/PurchaseRequestModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getSalesOrderSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

/**
 * Relation labels come from eager-loaded associations, not stored snapshots.
 * Customer/PR are same-module (static imports, guarded registration);
 * warehouse and product/variant labels are cross-module (dynamic imports —
 * a missing module degrades to null labels, never fails the lookup).
 */
async function buildRelationIncludes(): Promise<any[]> {
  const includes: any[] = [];
  try {
    await CustomerModelFactory();
    const associations = (SalesOrderModel as any).associations ?? {};
    if (!associations.customer) {
      SalesOrderModel.belongsTo(CustomerModel, {
        foreignKey: "customer_id",
        targetKey: "uuid",
        as: "customer",
        constraints: false,
      });
    }
    includes.push({ model: CustomerModel, as: "customer", required: false });
  } catch {
    // Degrade to a plain row read with a null customer label.
  }
  try {
    await PurchaseRequestModelFactory();
    const associations = (SalesOrderModel as any).associations ?? {};
    if (!associations.purchase_request) {
      SalesOrderModel.belongsTo(PurchaseRequestModel, {
        foreignKey: "purchase_request_id",
        targetKey: "uuid",
        as: "purchase_request",
        constraints: false,
      });
    }
    includes.push({ model: PurchaseRequestModel, as: "purchase_request", required: false });
  } catch {
    // Degrade to a plain row read with a null PR label.
  }
  try {
    const { default: WarehouseModelFactory } = await import("@/app/warehouse/models/WarehouseModel");
    const WarehouseModel = await WarehouseModelFactory();
    const associations = (SalesOrderModel as any).associations ?? {};
    if (!associations.warehouse) {
      SalesOrderModel.belongsTo(WarehouseModel, {
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

export class SalesOrderGetUseCase extends BaseUseCase<string, SalesOrder | null, string> {

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getSalesOrderSchema, { uuid });

    await SalesOrderModelFactory();
    const row = await SalesOrderModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!row) {
      throw new NotFoundException("Sales order not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(uuid: string): Promise<SalesOrder | null> {
    await SalesOrderModelFactory();
    const row = await SalesOrderModel.findOne({
      where: { uuid, deleted_at: null },
      include: await buildRelationIncludes(),
    });
    if (!row) {
      return null;
    }

    await SalesOrderItemModelFactory();
    const items = await SalesOrderItemModel.findAll({
      where: { sales_order_id: uuid, deleted_at: null },
      order: [["created_at", "ASC"]],
    });
    const { productByUuid, variantByUuid } = await resolveItemLabels(items);

    return {
      ...SalesOrderModel.toApi(row.toJSON()),
      items: items.map((item) => {
        const product = productByUuid.get(item.product_id);
        const variant = item.variant_id ? variantByUuid.get(item.variant_id) : undefined;
        return SalesOrderItemModel.toApi({
          ...item.toJSON(),
          product_sku: product?.sku ?? null,
          product_name: product?.name ?? null,
          variant_sku: variant?.sku ?? null,
          variant_name: variant?.name ?? null,
        });
      }),
    };
  }
}
