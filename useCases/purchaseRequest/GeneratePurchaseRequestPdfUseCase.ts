import Joi from "joi";
import PurchaseRequestModelFactory, { PurchaseRequestModel } from "@/app/sales/models/PurchaseRequestModel";
import { PurchaseRequestGetUseCase } from "@/app/sales/useCases/purchaseRequest/PurchaseRequestGetUseCase";
import type { ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";
import { pdfRequestSchema, type PdfRequestInput, type ValidatedPdfRequest } from "@/libraries/google/PdfRequest";
import { activePdfTemplate, resolvePdfActor } from "@/libraries/google/PdfGeneration";
import { generateGoogleDocsPdf, type GeneratedPdf } from "@/libraries/google/GoogleDocsPdfGenerator";
import { purchaseRequestPdfParameters } from "@/app/sales/libraries/pdf/purchaseRequestPdfParameters";

type Context = { uuid: string; request: ValidatedPdfRequest; actorInfo: Awaited<ReturnType<typeof resolvePdfActor>> };
export class GeneratePurchaseRequestPdfUseCase extends BaseUseCase<string, GeneratedPdf, Context> {
  protected async preExec(uuid: string, input: PdfRequestInput, actor?: ActivityActor): Promise<Context> {
    const id = await this.validate<{ uuid: string }>(Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() }), { uuid });
    const request = await this.validate<ValidatedPdfRequest>(pdfRequestSchema, input ?? {});
    const actorInfo = await resolvePdfActor(actor ?? null);
    await PurchaseRequestModelFactory();
    const row = await PurchaseRequestModel.findOne({ where: { uuid: id.uuid, organization_id: actorInfo.organizationId, deleted_at: null } });
    if (!row) throw new NotFoundException("Purchase request not found.");
    return { uuid: id.uuid, request, actorInfo };
  }
  protected async execute(context: Context): Promise<GeneratedPdf> {
    const request = await new PurchaseRequestGetUseCase().exec(context.uuid);
    if (!request) throw new NotFoundException("Purchase request not found.");
    const template = await activePdfTemplate("purchase_request", context.actorInfo.organizationId);
    return generateGoogleDocsPdf({ templateId: template.google_doc_id, documentType: "purchase_request", parameters: purchaseRequestPdfParameters(request, { ...context.request, actorName: context.actorInfo.actorName, organizationName: context.actorInfo.organizationName }), filenameBase: request.doc_number ?? `PR-${request.uuid}`, output: context.request.output });
  }
}
