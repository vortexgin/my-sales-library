import Joi from "joi";
import DocMetadataFieldModelFactory, { DocMetadataFieldModel, type DocMetadataField } from "@/app/sales/models/DocMetadataFieldModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const getDocMetadataFieldSchema = Joi.object({
  uuid: Joi.string().uuid({ version: "uuidv4" }).required(),
});

export class DocMetadataFieldGetUseCase extends BaseUseCase<string, DocMetadataField | null, string> {

  private docMetadataFieldData?: DocMetadataFieldModel | null;

  protected async preExec(uuid: string): Promise<string> {
    const validatedUuid = await this.validate<{ uuid: string }>(getDocMetadataFieldSchema, { uuid });

    await DocMetadataFieldModelFactory();
    this.docMetadataFieldData = await DocMetadataFieldModel.findOne({ where: { uuid: validatedUuid.uuid, deleted_at: null } });
    if (!this.docMetadataFieldData) {
      throw new NotFoundException("Doc metadata field not found")
    }

    return validatedUuid.uuid;
  }

  protected async execute(): Promise<DocMetadataField | null> {
    return DocMetadataFieldModel.toApi(this.docMetadataFieldData?.toJSON());
  }
}
