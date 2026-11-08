-- Manual rollback for 20261109030000_newsletter_domains.sql.
-- Drops the newsletter staff-test tables and functions. Does not touch
-- workspace_email_credentials or any earlier migration.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop function if exists private.newsletter_finish_staff_delivery(uuid, uuid, text);
drop function if exists private.newsletter_reserve_staff_delivery(uuid, uuid, text, text, text, boolean);
drop function if exists private.newsletter_unsubscribe(text);
drop function if exists private.newsletter_insert_subscriber(uuid, text, text);
drop function if exists private.newsletter_set_approval(uuid, uuid, text, text);
drop function if exists private.newsletter_read_claim(uuid);
drop function if exists private.newsletter_insert_domain(uuid, uuid, text, text, jsonb, boolean, boolean, boolean, text, boolean);

drop table if exists private.newsletter_deliveries;
drop table if exists private.newsletter_sender_addresses;
drop table if exists private.newsletter_domain_audit;
drop table if exists private.newsletter_subscribers;
drop table if exists private.newsletter_sending_domains;

commit;
