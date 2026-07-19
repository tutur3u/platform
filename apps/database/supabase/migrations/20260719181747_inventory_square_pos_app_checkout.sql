-- Treat the Square Point of Sale mobile app as a separate checkout provider
-- from remotely-addressable Square Terminal hardware. Both providers reuse the
-- verified Square payment completion contract and checkout observability
-- columns, so no payment or stock state is duplicated.

alter table private.inventory_storefronts
  drop constraint if exists inventory_storefronts_checkout_mode_check;

alter table private.inventory_storefronts
  add constraint inventory_storefronts_checkout_mode_check
  check (
    checkout_mode in (
      'polar',
      'square_pos',
      'square_terminal',
      'simulated',
      'disabled'
    )
  );

alter table private.inventory_checkout_sessions
  drop constraint if exists inventory_checkout_sessions_checkout_provider_check;

alter table private.inventory_checkout_sessions
  add constraint inventory_checkout_sessions_checkout_provider_check
  check (
    checkout_provider is null
    or checkout_provider in (
      'polar',
      'square_pos',
      'square_terminal',
      'simulated',
      'disabled'
    )
  );

alter table private.inventory_checkout_sessions
  add column if not exists square_pos_request_id text,
  add column if not exists square_pos_client_transaction_id text;

create unique index if not exists inventory_checkout_sessions_square_pos_request_idx
  on private.inventory_checkout_sessions (square_pos_request_id)
  where square_pos_request_id is not null;

drop index if exists private.inventory_checkout_sessions_square_status_idx;
create index if not exists inventory_checkout_sessions_square_status_idx
  on private.inventory_checkout_sessions (ws_id, square_status, created_at desc)
  where checkout_provider in ('square_pos', 'square_terminal');

notify pgrst, 'reload schema';
