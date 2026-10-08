import { randomUUID } from "crypto";
import Joi from "joi";
import SalesOrderMetadataModelFactory, { SalesOrderMetadataModel, type CreateSalesOrderMetadataInput, type SalesOrderMetadata } from "@/app/sales/models/SalesOrderMetadataModel";
import DocMetadataFieldModelFactory, { DocMetadataFieldModel } from "@/app/sales/models/DocMetadataFieldModel";
import { UniqueConstraintError } from "sequelize";
import { findSalesOrderInScope } from "@/app/sales/useCases/salesOrderMetadata/salesOrderMetadataScope";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";

const createSalesOrderMetadataSchema = Joi.object({
  sales_order_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  sales_doc_metadata_field_id: Joi.string().uuid({ version: "uuidv4" }).required(),
  value: Joi.string().trim().min(1).required(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).unknown(false);

export class SalesOrderMetadataCreateUseCase extends BaseUseCase<CreateSalesOrderMetadataInput, SalesOrderMetadata, { input: CreateSalesOrderMetadataInput; actor: ActivityActor }> {
  protected async preExec(input: CreateSalesOrderMetadataInput, actor?: ActivityActor): Promise<{ input: CreateSalesOrderMetadataInput; actor: ActivityActor }> {
    const validated = await this.validate<CreateSalesOrderMetadataInput>(createSalesOrderMetadataSchema, input);

    const { organizationId } = await findSalesOrderInScope(validated.sales_order_id, actor ?? null);

    await DocMetadataFieldModelFactory();
    const field = await DocMetadataFieldModel.findOne({
      where: { uuid: validated.sales_doc_metadata_field_id, organization_id: organizationId, deleted_at: null },
    });
    if (!field) {
      throw new NotFoundException("Doc metadata field not found.");
    }

    return { input: validated, actor: actor ?? null };
  }

  protected async execute(context: { input: CreateSalesOrderMetadataInput; actor: ActivityActor }): Promise<SalesOrderMetadata> {
    const { input } = context;
    await SalesOrderMetadataModelFactory();
    let row;
    try {
      row = await SalesOrderMetadataModel.create({
        uuid: randomUUID(),
        sales_order_id: input.sales_order_id,
        sales_doc_metadata_field_id: input.sales_doc_metadata_field_id,
        value: input.value?.trim(),
        status: input.status ?? "active",
        deleted_at: null,
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("Duplicate sales order metadata row.");
      }
      throw error;
    }

    return SalesOrderMetadataModel.toApi(row.toJSON());
  }

  protected async postExec(
    result: SalesOrderMetadata,
    context?: { input: CreateSalesOrderMetadataInput; actor: ActivityActor },
  ): Promise<SalesOrderMetadata> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "sales_order_metadata",
      entity_uuid: result.uuid,
      origin: null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
