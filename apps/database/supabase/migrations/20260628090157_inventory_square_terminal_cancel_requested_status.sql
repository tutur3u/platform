alter table private.inventory_checkout_sessions
  drop constraint if exists inventory_checkout_sessions_square_status_check;

alter table private.inventory_checkout_sessions
  add constraint inventory_checkout_sessions_square_status_check
  check (
    square_status is null
    or square_status in (
      'cancel_requested',
      'checkout_created',
      'pending',
      'in_progress',
      'paid',
      'completed',
      'cancelled',
      'canceled',
      'expired',
      'failed'
    )
  );

notify pgrst, 'reload schema';
