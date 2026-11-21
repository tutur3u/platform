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
| Categories and tags | `view/transaction_categories_page.dart`; tag cards show the usage totals the tags endpoint returns. Web has no category merge; `categories/migrate` is a data-migration upsert |
| Wallet interest | `view/wallet_interest_sheet.dart` with rate history, projection chart and pending deposits (`widgets/wallet_interest_extras.dart`); web's image-based provider hint is covered by setup |
| Credit wallets and wallet images | `view/wallet_credit_sheet.dart`, `widgets/wallet_image_picker_sheet.dart` |
| Checkpoints and reconciliation | `view/finance_checkpoints_page.dart`, `view/wallet_reconciliation_panel.dart`, plus mobile-only wallet archiving |
| Invoice history and restore | `view/finance_invoice_history_sheet.dart` |
| Debts and loans | `view/debts_page.dart`, `view/debt_detail_sheet.dart`, `view/debt_form_sheet.dart` |
| Wallet role access | `view/wallet_role_access_sheet.dart` from the wallet top bar |
| Invoice detail and share | `widgets/finance_invoice_receipt.dart` in the invoice sheet; PNG share matches web's export |
| Promotions | `view/finance_promotions_page.dart`, `view/promotion_form_sheet.dart`, promotion picker in `view/finance_invoice_editor.dart` |
| Budget alerts and upcoming recurring | `widgets/finance_budget_alerts.dart` on Overview, `widgets/recurring_upcoming.dart` in Recurring |
| Analytics | `view/finance_analytics_page.dart`: closing balance, income and expense bars, balance trend, category shares. Daily spending trends are covered by the day bars |
| More tools | `view/finance_more_actions.dart`: Invoices, Reports and Recurring open as sheets from the Finance More menu and their deep links |

Mobile also queues finance edits offline
(`lib/data/repositories/finance_pending_overlay.dart`).

## Gaps, in delivery order

Every remaining gap uses existing endpoints.

### P2

1. **Subscription invoices** (weaker). Attendance-based billing, prepaid
   controls and subscription analytics.
2. **Fee locks** (weaker). Batch lock, template preview, suggestions and
   export.
3. **Inventory reconciliation** (missing). Reconciliation panel and wallet
   inventory contribution.
4. **Admin and navigation tools** (missing). Wallet and transaction
   migration, all-wallet checkpoint history and a cross-entity quick search.
