begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop function if exists private.get_root_provider_invoice_postings(date);
drop function if exists private.get_provider_cost_complete_days(date, date);

commit;
