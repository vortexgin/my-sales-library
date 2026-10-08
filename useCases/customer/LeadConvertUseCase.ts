import { randomUUID } from "crypto";
import Joi from "joi";
import CustomerModelFactory, { CustomerModel, type Customer } from "@/app/sales/models/CustomerModel";
import LeadModelFactory, { LeadModel } from "@/app/sales/models/LeadModel";
import LeadMetadataModelFactory, { LeadMetadataModel } from "@/app/sales/models/LeadMetadataModel";
import LeadMetadataFieldModelFactory, { LeadMetadataFieldModel } from "@/app/sales/models/LeadMetadataFieldModel";
import LeadStatusModelFactory, { LeadStatusModel } from "@/app/sales/models/LeadStatusModel";
import CustomerMetadataModelFactory, { CustomerMetadataModel } from "@/app/sales/models/CustomerMetadataModel";
import CustomerMetadataFieldModelFactory, { CustomerMetadataFieldModel } from "@/app/sales/models/CustomerMetadataFieldModel";
import { UserModel } from "@/app/base/models/UserModel";
import { recordActivityLog, type ActivityActor } from "@/app/base/models/ActivityLogModel";
import { BaseUseCase } from "@/useCases/BaseUseCase";
import NotFoundException from "@/exceptions/NotFoundException";

const convertLeadSchema = Joi.object({
  lead_id: Joi.string().uuid({ version: "uuidv4" }).required(),
}).unknown(false);

export type LeadConvertResult = {
  customer: Customer;
  already_existed: boolean;
};

export class LeadConvertUseCase extends BaseUseCase<{ lead_id: string }, LeadConvertResult, { lead: LeadModel; actor: ActivityActor; organizationId: string | null }> {

  private leadData?: LeadModel | null;

  protected async preExec(input: { lead_id: string }, actor?: ActivityActor): Promise<{ lead: LeadModel; actor: ActivityActor; organizationId: string | null }> {
    const validated = await this.validate<{ lead_id: string }>(convertLeadSchema, input);

    const actorUuid = (actor as Record<string, unknown> | null)?.uuid;
    const organizationId =
      typeof actorUuid === "string" ? ((await UserModel.resolveOrganization(actorUuid))?.uuid ?? null) : null;

    await LeadModelFactory();
    this.leadData = await LeadModel.findOne({ where: { uuid: validated.lead_id, deleted_at: null } });
    if (!this.leadData || (this.leadData.organization_id ?? null) !== organizationId) {
      throw new NotFoundException("Lead not found.");
    }

    return { lead: this.leadData, actor: actor ?? null, organizationId };
  }

  protected async execute(context: { lead: LeadModel; actor: ActivityActor; organizationId: string | null }): Promise<LeadConvertResult> {
    const { lead, actor, organizationId } = context;
    const email = lead.email.trim().toLowerCase();

    await CustomerModelFactory();
    const existingCustomer = await CustomerModel.findOne({
      where: { email, organization_id: organizationId, deleted_at: null },
    });
    if (existingCustomer) {
      return { customer: CustomerModel.toApi(existingCustomer.toJSON()), already_existed: true };
    }

    const customer = await CustomerModel.create({
      uuid: randomUUID(),
      organization_id: organizationId ?? null,
      lead_id: lead.uuid,
      name: lead.name?.trim(),
      email,
      phone: lead.phone_number?.trim(),
      company_name: lead.company?.trim() || null,
      notes: lead.notes?.trim() || null,
      status: "active",
      deleted_at: null,
    });
    const api = CustomerModel.toApi(customer.toJSON());

    // Copy lead metadata rows verbatim; resolve customer fields by name
    // per org (auto-create when missing). Lead rows are untouched.
    await LeadMetadataModelFactory();
    const leadRows = await LeadMetadataModel.findAll({
      where: { leads_id: lead.uuid, deleted_at: null },
    });
    if (leadRows.length > 0) {
      await LeadMetadataFieldModelFactory();
      await CustomerMetadataFieldModelFactory();
      await CustomerMetadataModelFactory();
      for (const leadRow of leadRows) {
        const leadField = await LeadMetadataFieldModel.findOne({ where: { uuid: leadRow.lead_metadata_field_id } });
        const fieldName = leadField?.name?.trim() || leadRow.lead_metadata_field_id;
        let customerField = await CustomerMetadataFieldModel.findOne({
          where: { organization_id: organizationId, name: fieldName, deleted_at: null },
        });
        if (!customerField) {
          customerField = await CustomerMetadataFieldModel.create({
            uuid: randomUUID(),
            organization_id: organizationId ?? null,
            name: fieldName,
            description: leadField?.description ?? fieldName,
            status: "active",
            deleted_at: null,
          });
        }
        await CustomerMetadataModel.create({
          uuid: randomUUID(),
          customer_id: api.uuid,
          customer_metadata_field_id: customerField.uuid,
          value: leadRow.value,
          status: "active",
          deleted_at: null,
        });
      }
    }

    // Mark the lead at the converted-final stage (internal update, no billing).
    await LeadStatusModelFactory();
    const finalName = await LeadStatusModel.resolveFinalName(organizationId);
    if (finalName && lead.status !== finalName) {
      await lead.update({ status: finalName, updated_at: new Date() });
    }

    void recordActivityLog({
      actor: actor ?? null,
      operation: "create",
      entity: "customer",
      entity_uuid: api.uuid,
      origin: null,
      updated: api as unknown as Record<string, unknown>,
    });
    return { customer: api, already_existed: false };
  }
}
