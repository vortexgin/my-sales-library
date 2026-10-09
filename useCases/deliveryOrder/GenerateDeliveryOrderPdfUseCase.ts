import Joi from "joi";
import DeliveryOrderModelFactory, { DeliveryOrderModel } from "@/app/sales/models/DeliveryOrderModel";
import SalesOrderModelFactory, { SalesOrderModel } from "@/app/sales/models/SalesOrderModel";
import CustomerModelFactory, { CustomerModel } from "@/app/sales/models/CustomerModel";
import { DeliveryOrderGetUseCase } from "@/app/sales/useCases/deliveryOrder/DeliveryOrderGetUseCase";
import type { ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";
import { pdfRequestSchema, type PdfRequestInput, type ValidatedPdfRequest } from "@/libraries/google/PdfRequest";
import { activePdfTemplate, resolvePdfActor } from "@/libraries/google/PdfGeneration";
import { generateGoogleDocsPdf, type GeneratedPdf } from "@/libraries/google/GoogleDocsPdfGenerator";
import { deliveryOrderPdfParameters } from "@/app/sales/libraries/pdf/deliveryOrderPdfParameters";

type Context = { uuid: string; request: ValidatedPdfRequest; actorInfo: Awaited<ReturnType<typeof resolvePdfActor>> };
export class GenerateDeliveryOrderPdfUseCase extends BaseUseCase<string, GeneratedPdf, Context> {
  protected async preExec(uuid: string, input: PdfRequestInput, actor?: ActivityActor): Promise<Context> {
    const id = await this.validate<{ uuid: string }>(Joi.object({ uuid: Joi.string().uuid({ version: "uuidv4" }).required() }), { uuid });
    const request = await this.validate<ValidatedPdfRequest>(pdfRequestSchema, input ?? {});
    const actorInfo = await resolvePdfActor(actor ?? null);
    await DeliveryOrderModelFactory();
    if (!await DeliveryOrderModel.findOne({ where: { uuid: id.uuid, organization_id: actorInfo.organizationId, deleted_at: null } })) throw new NotFoundException("Delivery order not found.");
    return { uuid: id.uuid, request, actorInfo };
  }
  protected async execute(context: Context): Promise<GeneratedPdf> {
    const order = await new DeliveryOrderGetUseCase().exec(context.uuid);
    if (!order) throw new NotFoundException("Delivery order not found.");
    await SalesOrderModelFactory();
    const salesOrder = await SalesOrderModel.findOne({ where: { uuid: order.sales_order_id, organization_id: context.actorInfo.organizationId } });
    if (!salesOrder) throw new NotFoundException("Sales order not found.");
    await CustomerModelFactory();
    const customer = await CustomerModel.findOne({ where: { uuid: salesOrder.customer_id, organization_id: context.actorInfo.organizationId } });
    const relations = { salesOrder: { id: salesOrder.uuid, number: salesOrder.doc_number ?? salesOrder.uuid, status: salesOrder.status }, customer: { id: salesOrder.customer_id, name: customer?.name ?? salesOrder.customer_id } };
    const template = await activePdfTemplate("delivery_order", context.actorInfo.organizationId);
    return generateGoogleDocsPdf({ templateId: template.google_doc_id, documentType: "delivery_order", parameters: deliveryOrderPdfParameters(order, relations, { ...context.request, actorName: context.actorInfo.actorName, organizationName: context.actorInfo.organizationName }), filenameBase: order.doc_number ?? `DO-${order.uuid}`, output: context.request.output });
  }
}
