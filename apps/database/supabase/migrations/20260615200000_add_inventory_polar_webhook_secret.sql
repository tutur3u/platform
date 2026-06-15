-- Per-workspace Polar webhook signing secret.
--
-- Each workspace connects its own Polar organization, which has its own webhook
-- endpoint + signing secret configured in the Polar dashboard. To verify and
-- ingest events from that organization (checkout/order/product), we store the
-- signing secret per (workspace, environment), encrypted with the workspace
-- key (same as the access token). Additive, private-schema only.

alter table private.inventory_polar_integrations
  add column if not exists webhook_secret_encrypted text,
  add column if not exists webhook_secret_last4 text;
