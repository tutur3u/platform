begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The collected lines are reproducible from the provider billing APIs, so
-- dropping them loses no source evidence. Disable the provider-cost-collection
-- Cron Control job before running this.
drop function if exists private.get_provider_cost_collection_status();
drop function if exists private.get_provider_cost_daily(date, date);
drop function if exists private.plan_provider_cost_days(text, text, date[], date, date, integer);
drop function if exists private.mark_provider_cost_day_exhausted(text, text, date);
drop function if exists private.claim_provider_cost_day(text, text, date);
drop function if exists private.record_provider_cost_day(text, text, date, timestamptz, jsonb);
drop function if exists private.lock_provider_cost_day(text, text, date);
drop table if exists private.provider_cost_collection_days;
drop table if exists private.provider_cost_lines;

commit;
