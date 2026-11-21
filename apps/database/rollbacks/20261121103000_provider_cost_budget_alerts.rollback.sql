begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Budgets and sent-alert keys are operator configuration and delivery
-- receipts; notifications already delivered stay in public.notifications.
drop function if exists private.dispatch_provider_cost_budget_alerts(date);
drop function if exists private.get_provider_cost_budgets();
drop function if exists private.set_provider_cost_budget(text, numeric, numeric);
drop function if exists private.send_root_operator_alert(text, text, text, text, jsonb, text[], public.notification_priority);
drop table if exists private.provider_cost_budgets;
drop table if exists private.root_operator_alerts;

commit;
