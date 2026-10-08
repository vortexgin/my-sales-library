import { randomUUID } from "crypto";
import Joi from "joi";
import { UniqueConstraintError } from "sequelize";
import DocMetadataFieldModelFactory, { DocMetadataFieldModel, type CreateDocMetadataFieldInput, type DocMetadataField } from "@/app/sales/models/DocMetadataFieldModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";

const createDocMetadataFieldSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  description: Joi.string().trim().min(2).required(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
});

export class DocMetadataFieldCreateUseCase extends BaseUseCase<CreateDocMetadataFieldInput, DocMetadataField, { input: CreateDocMetadataFieldInput; actor: ActivityActor; organizationId: string | null }> {
  protected async preExec(input: CreateDocMetadataFieldInput, actor?: ActivityActor): Promise<{ input: CreateDocMetadataFieldInput; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<CreateDocMetadataFieldInput>(createDocMetadataFieldSchema, input);

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await DocMetadataFieldModelFactory();
    const existingRow = await DocMetadataFieldModel.findOne({
      where: { organization_id: organizationId, name: validated.name.trim(), deleted_at: null },
    });
    if (existingRow) {
      throw new DuplicateEntityException("A doc metadata field with this name already exists.");
    }

    return { input: validated, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { input: CreateDocMetadataFieldInput; actor: ActivityActor; organizationId: string | null }): Promise<DocMetadataField> {
    const { input, organizationId } = context;
    await DocMetadataFieldModelFactory();
    try {
      const row = await DocMetadataFieldModel.create({
        uuid: randomUUID(),
        organization_id: organizationId ?? null,
        name: input.name?.trim(),
        description: input.description?.trim(),
        status: input.status ?? "active",
        deleted_at: null,
      });

      return DocMetadataFieldModel.toApi(row.toJSON());
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("A doc metadata field with this name already exists.");
      }
      throw error;
    }
  }

  protected async postExec(
    result: DocMetadataField,
    context?: { input: CreateDocMetadataFieldInput; actor: ActivityActor; organizationId: string | null },
  ): Promise<DocMetadataField> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "create",
      entity: "doc_metadata_field",
      entity_uuid: result.uuid,
      origin: null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
