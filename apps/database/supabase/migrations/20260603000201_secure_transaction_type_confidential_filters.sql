-- Prevent transaction type filters from classifying confidential amount signs
-- for callers without view_confidential_amount. The current RPC definitions are
-- already large and have accumulated several rollout fixes, so this migration
-- patches the exact vulnerable predicate in-place and fails loudly if the
-- expected current definition is not present.

do $$
declare
  v_definition text;
  v_replaced text;
  v_old_static_filter constant text := $old$
      AND (
        p_transaction_type IS NULL
        OR (p_transaction_type = 'income' AND wt.amount > 0)
        OR (p_transaction_type = 'expense' AND wt.amount < 0)
      )$old$;
  v_new_static_filter constant text := $new$
      AND (
        p_transaction_type IS NULL
        OR (
          (NOT wt.is_amount_confidential OR v_can_view_amount)
          AND (
            (p_transaction_type = 'income' AND wt.amount > 0)
            OR (p_transaction_type = 'expense' AND wt.amount < 0)
          )
        )
      )$new$;
  v_old_list_filter constant text := $old$
        AND (
          $24::text IS NULL
          OR ($24 = ''income'' AND wt.amount > 0)
          OR ($24 = ''expense'' AND wt.amount < 0)
        )$old$;
  v_new_list_filter constant text := $new$
        AND (
          $24::text IS NULL
          OR (
            ($1 OR NOT wt.is_amount_confidential)
            AND (
              ($24 = ''income'' AND wt.amount > 0)
              OR ($24 = ''expense'' AND wt.amount < 0)
            )
          )
        )$new$;
begin
  v_definition := pg_get_functiondef(
    'public.get_transaction_stats(uuid,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamp with time zone,timestamp with time zone)'::regprocedure
  );
  v_replaced := replace(v_definition, v_old_static_filter, v_new_static_filter);
  if v_replaced = v_definition then
    raise exception 'Expected transaction type predicate not found in %', 'public.get_transaction_stats';
  end if;
  execute v_replaced;

  v_definition := pg_get_functiondef(
    'public.get_wallet_transactions_with_permissions(uuid,uuid,uuid[],uuid[],uuid[],uuid[],uuid[],text,text,timestamp with time zone,timestamp with time zone,text,text,integer,integer,timestamp with time zone,timestamp with time zone,boolean)'::regprocedure
  );
  v_replaced := replace(v_definition, v_old_list_filter, v_new_list_filter);
  if v_replaced = v_definition then
    raise exception 'Expected transaction type predicate not found in %', 'public.get_wallet_transactions_with_permissions';
  end if;
  execute v_replaced;

  v_definition := pg_get_functiondef(
    'public.get_transactions_by_period(uuid,text,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,integer,text)'::regprocedure
  );
  v_replaced := replace(v_definition, v_old_static_filter, v_new_static_filter);
  if v_replaced = v_definition then
    raise exception 'Expected transaction type predicate not found in %', 'public.get_transactions_by_period';
  end if;
  execute v_replaced;
end $$;

notify pgrst, 'reload schema';
