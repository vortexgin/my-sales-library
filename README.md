# Sales Module — Leads Management

**Module:** `sales` (git submodule `vortexgin/my-sales-library`)
**Entities:** `lead` · `lead-activity` · `lead-metadata` · `lead-metadata-field` · `lead-status`

## Purpose

Track prospective customers from first contact through conversion.
Each entity follows the repo slice:
Model → UseCases → encrypted + authorized API routes →
components → views + `paths.ts`.

## Entities

| Entity | Table | Collection route | Activity entity |
|---|---|---|---|
| lead | `sales_leads` | `/sales/api/v1/leads` | `lead` |
| lead-activity | `sales_lead_activities` | `/sales/api/v1/lead-activities` | `lead_activity` |
| lead-metadata | `sales_lead_metadata` | `/sales/api/v1/lead-metadata` | `lead_metadata` |
| lead-metadata-field | `sales_lead_metadata_fields` | `/sales/api/v1/lead-metadata-fields` | `lead_metadata_field` |
| lead-status | `sales_lead_statuses` | `/sales/api/v1/lead-statuses` | `lead_status` |

## Lead fields

`uuid`, `name`, `email` (unique), `phone_number`, `company` (nullable),
`source` (enum), `status` (**free-form string**, default `"new"` — stages are
defined in lead-status master data, not the DB), `value` (nullable),
`assigned_to` (nullable FK → `base_users.uuid`), `organization_id`
(auto-filled, immutable), `notes`, plus `created_at / updated_at / deleted_at`.

## Leads board (not a table)

`views/leads/page.tsx` renders `components/lead/LeadBoard.tsx`: a kanban
board that fetches **lead-statuses and leads independently**
(`Promise.allSettled`) and groups leads into drag-and-drop columns by
`status.name`. Leads with an unknown status fall into an `Other` column.
A statuses outage degrades to a scoped warning — it never blanks the leads.

Couplings (all client-side, all permission-gated):

- Columns ← `GET /sales/api/v1/lead-statuses`
  (requires `sales:lead-status:list:list`).
- Drag-and-drop / per-card status `<select>` → `PUT /sales/api/v1/leads/{uuid}`
  (requires `sales:lead:view:update`).
- `LeadForm` status and metadata-field dropdowns ← lead-statuses and
  lead-metadata-fields APIs; they render empty when those calls fail.
- `LeadDetailClient` / `LeadActivitySection` ← lead-activities API
  (`filter[leads_id]`).

## Conventions

- **Permissions** `sales:<entity>:list:list`, `sales:<entity>:create:create`,
  `sales:<entity>:view:detail`, `sales:<entity>:view:update`,
  `sales:<entity>:view:delete` — enforced via `withAuthorization` (API)
  and `AuthComponent` + `AccessDenied` (views). Sidebar menus are gated by
  `base:menu:sales:*` codes (Sales → Lead, Lead Status, Metadata Field).
- **Billing:** only `LeadCreateUseCase` uses the `TransactionUseCase`
  baseline (`checkTransaction` / `settleTransaction`). Master-data creates
  (statuses, metadata, fields, activities) log plain activity rows.
- **Organization:** `organization_id` is resolved from the acting user's
  organization link on create and list (`applyOrganizationScope`); it is
  never accepted from the payload and never updatable. Unlinked actors keep
  full visibility.
- **Soft delete:** `deleted_at` set on delete; all reads filter it.
  Master-data names are unique per organization (partial unique index +
  `DuplicateEntityException` on create/rename).
