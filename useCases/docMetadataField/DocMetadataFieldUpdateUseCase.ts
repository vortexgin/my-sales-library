import Joi from "joi";
import { Op, UniqueConstraintError } from "sequelize";
import DocMetadataFieldModelFactory, { DocMetadataFieldModel, type DocMetadataField, type UpdateDocMetadataFieldInput } from "@/app/sales/models/DocMetadataFieldModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import DuplicateEntityException from "@/exceptions/DuplicateEntityException";
import NotFoundException from "@/exceptions/NotFoundException";

const updateDocMetadataFieldSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).optional(),
  description: Joi.string().trim().min(2).optional(),
  status: Joi.string().valid("active", "inactive", "deleted").optional(),
}).min(1);

export class DocMetadataFieldUpdateUseCase extends BaseUseCase<string, DocMetadataField, { uuid: string; input: UpdateDocMetadataFieldInput; actor: ActivityActor }> {

  private docMetadataFieldData?: DocMetadataFieldModel | null;
  private beforeData?: DocMetadataField | null;

  protected async preExec(uuid: string, input: UpdateDocMetadataFieldInput, actor?: ActivityActor): Promise<{ uuid: string; input: UpdateDocMetadataFieldInput; actor: ActivityActor }> {
    const validatedInput = await this.validate<UpdateDocMetadataFieldInput>(updateDocMetadataFieldSchema, input);

    await DocMetadataFieldModelFactory();
    this.docMetadataFieldData = await DocMetadataFieldModel.findOne({ where: { uuid, deleted_at: null } });
    if (!this.docMetadataFieldData) {
      throw new NotFoundException("Doc metadata field not found")
    }
    this.beforeData = DocMetadataFieldModel.toApi(this.docMetadataFieldData?.toJSON());

    if (validatedInput.name?.trim()) {
      const nameTaken = await DocMetadataFieldModel.findOne({
        where: {
          organization_id: this.beforeData?.organization_id ?? null,
          name: validatedInput.name.trim(),
          uuid: { [Op.ne]: uuid },
          deleted_at: null,
        },
      });
      if (nameTaken) {
        throw new DuplicateEntityException("A doc metadata field with this name already exists.");
      }
    }

    return { uuid, input: validatedInput, actor: actor ?? null };
  }

  protected async execute(context: { uuid: string; input: UpdateDocMetadataFieldInput; actor: ActivityActor }): Promise<DocMetadataField> {
    const { input } = context;
    const nextData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (typeof input.name === "string" && input.name.trim()) {
      nextData.name = input.name.trim();
    }

    if (typeof input.description === "string" && input.description.trim()) {
      nextData.description = input.description.trim();
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
      await this.docMetadataFieldData?.update(nextData);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new DuplicateEntityException("A doc metadata field with this name already exists.");
      }
      throw error;
    }

    return DocMetadataFieldModel.toApi(this.docMetadataFieldData?.toJSON());
  }

  protected async postExec(
    result: DocMetadataField,
    context?: { uuid: string; input: UpdateDocMetadataFieldInput; actor: ActivityActor },
  ): Promise<DocMetadataField> {
    void recordActivityLog({
      actor: context?.actor ?? null,
      operation: "update",
      entity: "doc_metadata_field",
      entity_uuid: context?.uuid ?? result.uuid,
      origin: this.beforeData ?? null,
      updated: result,
    });
    return super.postExec(result, context);
  }
}
