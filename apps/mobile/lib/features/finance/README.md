# Mobile Finance: parity with web Finance

Web Finance lives in `apps/finance` (pages under
`src/app/[locale]/(dashboard)/[wsId]/`) with shared components in
`packages/ui/src/components/ui/finance/` and handlers in
`packages/apis/src/finance/` and `apps/web/src/legacy-api-routes/`. Customer
behaviour of the mobile feature is recorded in
`apps/docs/platform/features/mobile-finance.mdx`.

Bill splitting (splits, settlement, contact bank accounts and share links) is
a separate module with its own owner and is not tracked here. Shared Finance
navigation keeps a slot for its "Split bills" entry.

## At parity

| Area | Mobile |
| --- | --- |
| Transactions, filters and search | `view/transaction_list_*`, period selector (day, week, month, year, custom, all time), wallet, category, tag and creator filters |
| Transfers and multi-currency | `view/transaction_create_*`, `widgets/currency_picker_dialog.dart`, exchange-rate conversion |
| Confidential fields and attachments | `data/models/finance/transaction.dart`, `view/transaction_detail_sheet_attachment_widgets.dart` |
| Imports and exports | `view/transaction_import_sheet.dart`, `view/transaction_export_sheet.dart`, `utils/finance_invoice_spreadsheet.dart` |
| Credit wallets and wallet images | `view/wallet_credit_sheet.dart`, `widgets/wallet_image_picker_sheet.dart` |
| Checkpoints and reconciliation | `view/finance_checkpoints_page.dart`, `view/wallet_reconciliation_panel.dart`, plus mobile-only wallet archiving |
| Invoice history and restore | `view/finance_invoice_history_sheet.dart` |
| Debts and loans | `view/debts_page.dart`, `view/debt_detail_sheet.dart`, `view/debt_form_sheet.dart` |
| Promotions | `view/finance_promotions_page.dart`, `view/promotion_form_sheet.dart`, promotion picker in `view/finance_invoice_editor.dart` |
| Budget alerts and upcoming recurring | `widgets/finance_budget_alerts.dart` on Overview, `widgets/recurring_upcoming.dart` in Recurring |
| Analytics | `view/finance_analytics_page.dart`: closing balance, income and expense bars, balance trend, category shares. Daily spending trends are covered by the day bars |

Mobile also queues finance edits offline
(`lib/data/repositories/finance_pending_overlay.dart`).

## Gaps, in delivery order

Every gap uses existing endpoints; only wallet role access needs a bearer-auth
check on its legacy route.

### P1

1. **Invoice detail and PDF share** (weaker). A read-only invoice view with a
   printable, shareable PDF rendered on the device.
2. **Wallet role access** (missing). List, grant and revoke workspace roles
   per wallet (`wallets/{id}/roles`, `roles/{roleId}`).
3. **Wallet interest history** (weaker). Rate history, interest chart,
   auto-detect banner and pending deposits (`interest/rates`,
   `interest/detect`).
4. **Category merge and tag usage** (weaker). Migrate one category into
   another (`transactions/categories/migrate`) and tag usage stats
   (`tags/stats`).

### P2

5. **Subscription invoices** (weaker). Attendance-based billing, prepaid
   controls and subscription analytics.
6. **Fee locks** (weaker). Batch lock, template preview, suggestions and
   export.
7. **Inventory reconciliation** (missing). Reconciliation panel and wallet
   inventory contribution.
8. **Admin and navigation tools** (missing). Wallet and transaction
    migration, all-wallet checkpoint history and a cross-entity quick search.
