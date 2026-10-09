import Joi from "joi";
import SalesOrderModelFactory, { SalesOrderModel } from "@/app/sales/models/SalesOrderModel";
import PurchaseRequestModelFactory, { PurchaseRequestModel } from "@/app/sales/models/PurchaseRequestModel";
import { SalesOrderGetUseCase } from "@/app/sales/useCases/salesOrder/SalesOrderGetUseCase";
import type { ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";
import { pdfRequestSchema, type PdfRequestInput, type ValidatedPdfRequest } from "@/libraries/google/PdfRequest";
import { activePdfTemplate, resolvePdfActor } from "@/libraries/google/PdfGeneration";
import { generateGoogleDocsPdf, type GeneratedPdf } from "@/libraries/google/GoogleDocsPdfGenerator";
import { salesOrderPdfParameters } from "@/app/sales/libraries/pdf/salesOrderPdfParameters";

type Context = { uuid: string; request: ValidatedPdfRequest; actorInfo: Awaited<ReturnType<typeof resolvePdfActor>> };
export class GenerateSalesOrderPdfUseCase extends BaseUseCase<string, GeneratedPdf, Context> {
  protected async preExec(uuid: string, input: PdfRequestInput, actor?: ActivityActor): Promise<Context> {
    const id = await this.validate<{ uuid: string }>(Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() }), { uuid });
    const request = await this.validate<ValidatedPdfRequest>(pdfRequestSchema, input ?? {});
    const actorInfo = await resolvePdfActor(actor ?? null);
    await SalesOrderModelFactory();
    if (!await SalesOrderModel.findOne({ where: { uuid: id.uuid, organization_id: actorInfo.organizationId, deleted_at: null } })) throw new NotFoundException("Sales order not found.");
    return { uuid: id.uuid, request, actorInfo };
  }
  protected async execute(context: Context): Promise<GeneratedPdf> {
    const order = await new SalesOrderGetUseCase().exec(context.uuid);
    if (!order) throw new NotFoundException("Sales order not found.");
    let purchaseRequest = null;
    if (order.purchase_request_id) {
      await PurchaseRequestModelFactory();
      const row = await PurchaseRequestModel.findOne({ where: { uuid: order.purchase_request_id, organization_id: context.actorInfo.organizationId } });
      if (row) purchaseRequest = { id: row.uuid, number: row.doc_number ?? row.uuid, status: row.status };
    }
    const template = await activePdfTemplate("sales_order", context.actorInfo.organizationId);
    return generateGoogleDocsPdf({ templateId: template.google_doc_id, documentType: "sales_order", parameters: salesOrderPdfParameters(order, purchaseRequest, { ...context.request, actorName: context.actorInfo.actorName, organizationName: context.actorInfo.organizationName }), filenameBase: order.doc_number ?? `SO-${order.uuid}`, output: context.request.output });
  }
}
