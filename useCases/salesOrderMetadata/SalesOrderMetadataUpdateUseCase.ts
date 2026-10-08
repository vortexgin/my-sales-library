import Joi from "joi";
import SalesOrderMetadataModelFactory, { SalesOrderMetadataModel, type SalesOrderMetadata, type UpdateSalesOrderMetadataInput } from "@/app/sales/models/SalesOrderMetadataModel";
import DocMetadataFieldModelFactory, { DocMetadataFieldModel } from "@/app/sales/models/DocMetadataFieldModel";
import { UniqueConstraintError } from "sequelize";
import { findSalesOrderInScope } from "@/app/sales/useCases/salesOrderMetadata/salesOrderMetadataScope";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";

const updateSalesOrderMetadataSchema = Joi.object({
  sales_doc_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).optional(),
  value: Joi.string().trim().min(1).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).unknown(false).min(1);

export class SalesOrderMetadataUpdateUseCase extends BaseUseCase<string, SalesOrderMetadata, { uuid: string; input: UpdateSalesOrderMetadataInput; actor: ActivityActor }> {

  private salesOrderMetadataData?: SalesOrderMetadataModel | null;
  private beforeData?: SalesOrderMetadata | null;

  protected async preExec(uuid: string, input: UpdateSalesOrderMetadataInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateSalesOrderMetadataInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateSalesOrderMetadataInput>(updateSalesOrderMetadataSchema, input);

    await SalesOrderMetadataModelFactory();
    this.salesOrderMetadataData = await SalesOrderMetadataModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.salesOrderMetadataData) {
      throw new NotFoundException("Sales order metadata not found")
    }
    this.beforeData = SalesOrderMetadataModel.toApi(this.salesOrderMetadataData?.toJSON());

    const { organizationId } = await findSalesOrderInScope(this.salesOrderMetadataData.sales_order_id, actor ?? null);

    if (validatedInput.sales_doc_metadata_field_id) {
      await DocMetadataFieldModelFactory();
      const field = await DocMetadataFieldModel.findOne({
        where: { uuid: validatedInput.sales_doc_metadata_field_id, organization_id: organizationId, deleted_at: null },
      });
      if (!field) {
        throw new NotFoundException("Doc metadata field not found.");
      }
    }

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateSalesOrderMetadataInput; actor: ActivityActor }): Promise<SalesOrderMetadata> {
    const { input } = context;
    const nextData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (input.sales_doc_metadata_field_id) {
      nextData.sales_doc_metadata_field_id = input.sales_doc_metadata_field_id;
    }

    if (typeof input.value === "string" && input.value.trim()) {
      nextData.value = input.value.trim();
    }

    if (input.status) {
      nextData.status = input.status;
      if (input.status === "deleted") {
        nextData.deleted_at = new Date();
      } else {
        nextData.deleted_at = null;
      }
    }

    try {
      await this.salesOrderMetadataData?.update(nextData);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("Duplicate sales order metadata row.");
      }
      throw error;
    }

    return SalesOrderMetadataModel.toApi(this.salesOrderMetadataData?.toJSON());
  }

  protected async postExec(
    result: SalesOrderMetadata,
    context?: { uuid: string; input: UpdateSalesOrderMetadataInput; actor: ActivityActor },
  ): Promise<SalesOrderMetadata> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "sales_order_metadata",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
