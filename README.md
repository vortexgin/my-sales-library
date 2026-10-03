# Sales Module — Leads Management

**Module:** `sales` · **Entity:** `lead` · **Table:** `sales_leads`

## Purpose

Track prospective customers from first contact through conversion,
following the repo's standard `base/users` slice:
Model → UseCases → encrypted + authorized API routes →
Table/Form components → views + `paths.ts`.

## Lead Fields

| Field | Type | Notes |
|---|---|---|
| `uuid` | UUID PK | auto |
| `name` | string(120) | required, min 2 |
| `email` | string(160), unique | required |
| `phone_number` | string(30) | required, min 6 |
| `company` | string(160) | optional |
| `source` | enum | `website \| referral \| ads \| cold_call \| event \| other` (default `website`) |
| `status` | enum | `new \| contacted \| qualified \| converted \| lost` (default `new`) |
| `value` | integer, nullable | estimated deal value (minor units) |
| `assigned_to` | UUID, nullable | FK → `base_users.uuid` |
| `notes` | text, nullable | — |
| `created_at / updated_at / deleted_at` | — | soft-delete convention |

## Slice Outline

- **Model** `app/sales/models/LeadModel.ts` — `toApi()`,
  `Create/UpdateLeadInput`, lazy `getLeadModel()` factory.
- **UseCases** `app/sales/useCases/lead/Lead{List,Get,Create,Update,Delete}UseCase`
  extends `BaseUseCase` — Joi validation in `preExec`, billing + activity
  in `postExec`.
- **API** `app/sales/api/[version]/leads/route.ts` + `[uuid]/route.ts` —
  `withAuthorization` + `withEncryption`, `ok` / `fail` envelopes.
- **Components** `app/sales/components/lead/` — `LeadTable.tsx`
  (`filter[q]`, status/source filters, `StatusBadge`), `LeadForm.tsx`
  (assignee dropdown from users API), `DeleteLeadButton.tsx`.
- **Views** `app/sales/views/leads/` — list, `create`, `[uuid]` detail
  (+ `ActivityTimeline`), `[uuid]/edit`, `paths.ts` (`LEAD_LIST_PATH`).
- **Migration** `migrations/XXXX-create-sales-leads-table.js`.

## Permissions

`sales:lead:list:list`, `sales:lead:create:create`,
`sales:lead:view:detail`, `sales:lead:view:update`,
`sales:lead:view:delete` — enforced via `withAuthorization` (API)
and `AuthComponent` + `AccessDenied` (views).

## Billing / Activity

`LeadCreateUseCase` follows the `TransactionUseCase` baseline:
`checkTransaction(actor, "sales:lead:create:create")` in `preExec`,
`settleTransaction(...)` in `postExec` — creation consumes invoice
`credit_usage` on quota/transaction packages and records `credit`
on the activity timeline.
