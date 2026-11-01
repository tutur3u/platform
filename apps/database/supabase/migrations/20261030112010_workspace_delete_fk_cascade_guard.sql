-- IF NOT EXISTS must not accept an invalid index from an interrupted build.
BEGIN;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_index
    where indexrelid = pg_catalog.to_regclass('public.workspace_documents_ws_id_idx')
      and indrelid = 'public.workspace_documents'::regclass and indisvalid
  ) then
    raise exception using errcode = '55000',
      message = 'Required index workspace_documents_ws_id_idx is missing or invalid',
      hint = 'Drop the invalid index concurrently outside a transaction, resolve duplicates if applicable, rebuild, and retry.';
  end if;
end;
$$;
-- Part D: repair approved workspace document/log/team-membership delete blockers.
-- Catalog audit on the full main migration chain (through 20261026193000):
-- 465 reachable tables; 51 candidate blocking FKs, including transitive parents.
-- NO ACTION/RESTRICT candidates may already resolve through co-cascade paths;
-- this list is not a claim that every candidate fails a workspace DELETE.
-- Query: apps/database/verification/workspace-delete-catalog-audit.sql.
-- Respect confdelsetcols: the quiz answer SET NULL(selected_option_id) is safe
-- despite its separate NOT NULL quiz_id, so it is not listed.
--
-- Full candidate list: child | constraint | action | referenced parent
-- private.ai_live_sessions | ai_live_sessions_reservation_id_fkey | NO ACTION | private.ai_credit_reservations
-- private.ai_studio_agent_versions | ai_studio_agent_versions_prompt_version_id_fkey | RESTRICT | private.ai_studio_prompt_versions
-- private.calendar_provider_series_bindings | calendar_provider_series_bindings_connection_id_fkey | RESTRICT | public.calendar_connections
-- private.calendar_provider_series_operations | calendar_provider_series_operations_connection_id_fkey | RESTRICT | public.calendar_connections
-- private.calendar_provider_series_operations | calendar_provider_series_operations_series_id_fkey | RESTRICT | private.calendar_event_series
-- private.chat_message_attachments | chat_message_attachments_storage_ws_id_fkey | RESTRICT | public.workspaces
-- private.healthcare_checkup_vitals | healthcare_checkup_vitals_vital_id_fkey | NO ACTION | public.user_group_metrics
-- private.inventory_bundle_category_components | inventory_bundle_category_components_category_id_fkey | RESTRICT | public.product_categories
-- private.inventory_bundle_components | inventory_bundle_components_unit_id_fkey | RESTRICT | private.inventory_units
-- private.inventory_bundle_components | inventory_bundle_components_warehouse_id_fkey | RESTRICT | private.inventory_warehouses
-- private.inventory_checkout_lines | inventory_checkout_lines_product_id_fkey | RESTRICT | public.workspace_products
-- private.inventory_checkout_lines | inventory_checkout_lines_unit_id_fkey | RESTRICT | private.inventory_units
-- private.inventory_checkout_lines | inventory_checkout_lines_warehouse_id_fkey | RESTRICT | private.inventory_warehouses
-- private.inventory_checkout_sessions | inventory_checkout_sessions_storefront_id_fkey | RESTRICT | private.inventory_storefronts
-- private.inventory_checkout_stock_consumptions | inventory_checkout_stock_consumptions_product_id_fkey | RESTRICT | public.workspace_products
-- private.inventory_checkout_stock_consumptions | inventory_checkout_stock_consumptions_unit_id_fkey | RESTRICT | private.inventory_units
-- private.inventory_checkout_stock_consumptions | inventory_checkout_stock_consumptions_warehouse_id_fkey | RESTRICT | private.inventory_warehouses
-- private.inventory_product_prices | inventory_product_prices_period_id_ws_id_fkey | NO ACTION | private.inventory_sales_periods
-- private.inventory_product_prices | inventory_product_prices_product_id_fkey | NO ACTION | public.workspace_products
-- private.inventory_product_prices | inventory_product_prices_unit_id_fkey | NO ACTION | private.inventory_units
-- private.inventory_product_prices | inventory_product_prices_warehouse_id_fkey | NO ACTION | private.inventory_warehouses
-- private.inventory_reservations | inventory_reservations_product_id_fkey | RESTRICT | public.workspace_products
-- private.inventory_reservations | inventory_reservations_unit_id_fkey | RESTRICT | private.inventory_units
-- private.inventory_reservations | inventory_reservations_warehouse_id_fkey | RESTRICT | private.inventory_warehouses
-- private.inventory_sales_periods | inventory_period_merge_destination | NO ACTION | private.inventory_sales_periods
-- private.inventory_season_merge_prices | inventory_season_merge_prices_imported_price_id_fkey | NO ACTION | private.inventory_product_prices
-- private.inventory_season_merge_prices | inventory_season_merge_prices_original_price_id_fkey | NO ACTION | private.inventory_product_prices
-- private.inventory_season_merges | inventory_season_merges_source_id_ws_id_fkey | NO ACTION | private.inventory_sales_periods
-- private.inventory_season_merges | inventory_season_merges_target_id_ws_id_fkey | NO ACTION | private.inventory_sales_periods
-- private.inventory_storefront_listing_variants | inventory_storefront_listing_variants_unit_id_fkey | RESTRICT | private.inventory_units
-- private.inventory_storefront_listing_variants | inventory_storefront_listing_variants_warehouse_id_fkey | RESTRICT | private.inventory_warehouses
-- private.inventory_storefront_listings | inventory_storefront_listings_unit_id_fkey | RESTRICT | private.inventory_units
-- private.inventory_storefront_listings | inventory_storefront_listings_warehouse_id_fkey | RESTRICT | private.inventory_warehouses
-- private.mind_ai_patches | mind_ai_patches_thread_workspace_fk | NO ACTION | private.mind_ai_threads
-- private.mind_edges | mind_edges_source_board_workspace_fk | NO ACTION | private.mind_nodes
-- private.mind_edges | mind_edges_target_board_workspace_fk | NO ACTION | private.mind_nodes
-- private.mind_nodes | mind_nodes_merged_board_workspace_fk | NO ACTION | private.mind_nodes
-- private.mind_nodes | mind_nodes_parent_board_workspace_fk | NO ACTION | private.mind_nodes
-- private.team_members | project_members_project_id_fkey | NO ACTION | public.workspace_teams
-- private.topic_announcement_delivery_attempts | topic_announcement_delivery_attempts_email_audit_id_fkey | RESTRICT | public.email_audit
-- private.topic_announcement_delivery_attempts | topic_delivery_parent_scope | RESTRICT | private.topic_announcements
-- public.realtime_log_aggregations | realtime_log_aggregations_ws_id_fkey | SET NULL (NOT NULL target) | public.workspaces
-- public.sent_emails | sent_emails_receiver_id_fkey | NO ACTION | public.workspace_users
-- public.sepay_webhook_events | sepay_webhook_events_endpoint_id_fkey | RESTRICT | public.sepay_webhook_endpoints
-- public.task_leaderboards | task_leaderboards_metric_id_fkey | RESTRICT | public.task_progress_metrics
-- public.task_progress_entries | task_progress_entries_metric_id_fkey | RESTRICT | public.task_progress_metrics
-- public.task_progress_goals | task_progress_goals_metric_id_fkey | RESTRICT | public.task_progress_metrics
-- public.workspace_documents | workspace_documents_ws_id_fkey | NO ACTION | public.workspaces
-- public.workspace_products | workspace_products_manufacturer_id_fkey | RESTRICT | private.inventory_manufacturers
-- public.workspace_products | workspace_products_owner_id_fkey | RESTRICT | private.inventory_owners
-- public.workspace_settings | workspace_settings_referral_promo_fkey | SET NULL (NOT NULL target) | private.workspace_promotions
--
-- Disposition: change realtime_log_aggregations_ws_id_fkey,
-- workspace_documents_ws_id_fkey and project_members_project_id_fkey only.
-- Preserve the other 48 candidates for Mastermind.
-- No workspace-deletion retention policy has been approved. In particular:
-- * Topic delivery: immutable receipts and RESTRICT audit/parent references.
-- * AI Live: billing reservations may differ from the access workspace.
-- * Calendar/SePay: recoverable provider journals and bank event/dedupe history.
-- * Chat: storage workspace can differ from conversation ownership.
-- * AI versions, healthcare, sent mail, task metrics, commerce and pricing:
--   user-authored/history or cross-workspace references; no blanket cascade.
-- * Mind composites and deferred inventory merge provenance: existing ownership
--   cascades; preserve ordinary detach and history semantics.
-- * Team membership: approved after populated 23503 proof. Only membership
--   rows cascade from workspace_teams; user accounts are never deleted.
-- * Referral settings: composite SET NULL includes the NOT NULL workspace key;
--   CASCADE would erase live settings on promotion deletion. Separate decision.
-- Options for retained-history blockers: soft-delete the workspace, or approve
-- durable archival/reference migration before an explicit deletion procedure.
--
-- DELETE-trigger audit: intentional guards remain unchanged:
-- workspaces.trg_prevent_personal_workspace_deletion -> 23514 while creator lives.
-- private.topic_announcement_delivery_attempts.topic_delivery_attempt_immutability
--   -> 55000 on every attempt DELETE (even if its FK were changed).
-- private.external_user_monthly_reports.guard_processing_report_snapshot
--   -> 55P03 while delivery_status=processing; finish/reconcile before deletion.
-- private.user_linked_promotions.t_prevent_owner_referral_unlink
--   -> raises for an owner's referral while its promotion remains visible.
-- Inventory identity/checkout writers can raise 55P03 under merge contention;
-- merged-identity, merged-period and merged-reference guards, calendar Google
-- generation guard, and tutoring absence guards admit actual parent-workspace
-- removal. lock_inventory_pricing_period has no DELETE-raising branch.
-- No directly referenced DELETE/ALL policy function contains RAISE in the
-- audited catalog. RLS remains enforced for callers; no grants/policies change.
--
-- Populated local rehearsal (transaction rolled back after proof):
-- 1. Document + JSON content + meeting document + log bucket: DELETE -> 23503,
--    workspace_documents_ws_id_fkey.
-- 2. Temporarily repair document FK: DELETE -> 23502, realtime_log_aggregations.ws_id.
-- 3. Repair log FK: original fixture DELETE succeeds; affected children = 0.
-- 4. A team-only populated workspace also fails 23503 on
--    project_members_project_id_fkey; its approved CASCADE removes memberships,
--    leaving user accounts and memberships in other workspaces intact.
-- The old block/attribute tables were dropped by 20241024135412; do not recreate.
--
-- NOT VALID enforces new writes/deletes immediately without scanning old rows.
-- Validation is deliberately in 20261030112020, a separately shippable file.
-- Preserve ON UPDATE, match type, deferrability and all privileges.
-- Reserved after EC A/B/C 20261027010000-20261027010200 (owner-confirmed).
-- Rollback swaps original definitions NOT VALID, commits, then validates in a
-- separate rollback-validate file. Never combine those phases in a transaction.

set local lock_timeout = '5s';
set local statement_timeout = '120s';



alter table public.realtime_log_aggregations
  drop constraint realtime_log_aggregations_ws_id_fkey,
  add constraint realtime_log_aggregations_ws_id_fkey
    foreign key (ws_id) references public.workspaces(id)
    on update cascade on delete cascade not valid;

alter table public.workspace_documents
  drop constraint workspace_documents_ws_id_fkey,
  add constraint workspace_documents_ws_id_fkey
    foreign key (ws_id) references public.workspaces(id)
    on delete cascade not valid;

alter table private.team_members
  drop constraint project_members_project_id_fkey,
  add constraint project_members_project_id_fkey
    foreign key (team_id) references public.workspace_teams(id)
    on delete cascade not valid;

notify pgrst, 'reload schema';

COMMIT;
