revoke all on function public.create_inventory_checkout_session(
  text,
  jsonb,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.create_inventory_checkout_session(
  text,
  jsonb,
  timestamptz
) to service_role;

revoke all on function public.release_inventory_checkout_session(
  uuid,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.release_inventory_checkout_session(
  uuid,
  timestamptz
) to service_role;

revoke all on function public.complete_inventory_checkout_session(
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.complete_inventory_checkout_session(
  uuid,
  uuid,
  timestamptz
) to service_role;

revoke all on function public.complete_inventory_checkout_session_payment(
  uuid,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.complete_inventory_checkout_session_payment(
  uuid,
  text,
  timestamptz
) to service_role;

notify pgrst, 'reload schema';
