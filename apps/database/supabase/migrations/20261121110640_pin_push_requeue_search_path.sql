-- Security definers resolve names through an explicit path with pg_temp last.
-- The body qualifies every relation, so pg_catalog is the only schema it needs.
alter function private.requeue_mail_push_batches()
  set search_path = pg_catalog, pg_temp;
