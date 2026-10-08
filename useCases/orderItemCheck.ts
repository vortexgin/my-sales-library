import NotFoundException from "@/exceptions/NotFoundException";
import ForbiddenException from "@/exceptions/ForbiddenException";

/**
 * Cross-module product existence check with graceful degradation: when the
 * product module is absent the uuids are stored unchecked. Otherwise the
 * product must exist, and linked actors may only reference same-org or
 * global rows. Variant must belong to the product when given.
 */
export async function assertOrderProduct(
  product_id: string,
  variant_id: string | null | undefined,
  organizationId: string | null,
): Promise<void> {
  let ProductModel: any;
  let ProductVariantModel: any;
  try {
    const productModule = await import("@/app/product/models/ProductModel");
    ProductModel = productModule.ProductModel;
    await productModule.getProductModel();
  } catch {
    return;
  }

  const product = await ProductModel.findOne({ where: { uuid: product_id, deleted_at: null } });
  if (!product) {
    throw new NotFoundException("Product not found.");
  }
  const productOrg = product.organization_id ?? null;
  if (organizationId && productOrg !== null && productOrg !== organizationId) {
    throw new ForbiddenException("Product belongs to another organization.");
  }

  if (variant_id) {
    try {
      const variantModule = await import("@/app/product/models/ProductVariantModel");
      ProductVariantModel = variantModule.ProductVariantModel;
      await variantModule.getProductVariantModel();
    } catch {
      return;
    }
    const variant = await ProductVariantModel.findOne({ where: { uuid: variant_id, deleted_at: null } });
    if (!variant || variant.product_id !== product_id) {
      throw new NotFoundException("Product variant not found for this product.");
    }
  }
}
