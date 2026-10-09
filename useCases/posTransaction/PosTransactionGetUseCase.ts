import Joi from "joi";
import PosTransactionModelFactory, { PosTransactionModel, type PosTransaction, type PosTransactionItem } from "@/app/sales/models/PosTransactionModel";
import PosTransactionItemModelFactory, { PosTransactionItemModel } from "@/app/sales/models/PosTransactionItemModel";
import CustomerModelFactory, { CustomerModel } from "@/app/sales/models/CustomerModel";
import { UserModel } from "@/app/base/models/UserModel";
import { type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getPosTransactionSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

/**
 * Relation labels come from guarded cross-module reads, never stored
 * snapshots. A missing module degrades to null labels / uuid fallback.
 */
async function buildRelationIncludes(): Promise<any[]> {
  const includes: any[] = [];
  try {
    const { default: WarehouseModelFactory } = await import("@/app/warehouse/models/WarehouseModel");
    const WarehouseModel = await WarehouseModelFactory();
    const associations = (PosTransactionModel as any).associations ?? {};
    if (!associations.warehouse) {
      PosTransactionModel.belongsTo(WarehouseModel, {
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

export type PosTransactionDetail = PosTransaction & { items: PosTransactionItem[] };

export class PosTransactionGetUseCase extends BaseUseCase<string, PosTransactionDetail, string> {
  private transactionData?: PosTransactionModel | null;

  protected async preExec(uuid: string, actor?: ActivityActor): Promise<string> {
    const validated = await this.validate<{ uuid: string }>(getPosTransactionSchema, { uuid });

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await PosTransactionModelFactory();
    this.transactionData = await PosTransactionModel.findOne({
      where: { uuid: validated.uuid, deleted_at: null },
    });
    // Same-org only (unlinked actors see unlinked rows); 404 to avoid
    // leaking cross-org existence.
    if (!this.transactionData || (this.transactionData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("POS transaction not found.");
    }

    return validated.uuid;
  }

  protected async execute(uuid: string): Promise<PosTransactionDetail> {
    await PosTransactionModelFactory();
    const row = await PosTransactionModel.findOne({
      where: { uuid, deleted_at: null },
      include: await buildRelationIncludes(),
    });
    if (!row) {
      throw new NotFoundException("POS transaction not found.");
    }

    await PosTransactionItemModelFactory();
    const items = await PosTransactionItemModel.findAll({
      where: { transaction_id: uuid, deleted_at: null },
      order: [["created_at", "ASC"]],
    });
    const { productByUuid, variantByUuid } = await resolveItemLabels(items);

    let customer: PosTransaction["customer"] = null;
    const customerId = row.customer_id ?? null;
    if (customerId) {
      await CustomerModelFactory();
      const customerRow = await CustomerModel.findOne({ where: { uuid: customerId, deleted_at: null } }).catch(() => null);
      if (customerRow) {
        customer = { id: customerRow.uuid, name: customerRow.name, email: customerRow.email ?? "" };
      }
    }

    const api = PosTransactionModel.toApi({ ...(row.toJSON() as Record<string, unknown>), customer });
    return {
      ...api,
      items: items.map((item) => {
        const product = productByUuid.get(item.product_id);
        const variant = item.variant_id ? variantByUuid.get(item.variant_id) : undefined;
        return PosTransactionItemModel.toApi({
          ...(item.toJSON() as Record<string, unknown>),
          product_sku: product?.sku ?? null,
          product_name: product?.name ?? null,
          variant_sku: variant?.sku ?? null,
          variant_name: variant?.name ?? null,
        });
      }),
    };
  }
}
