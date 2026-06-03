do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_users_ws_id_id_key'
      and conrelid = 'public.workspace_users'::regclass
  ) then
    alter table public.workspace_users
      add constraint workspace_users_ws_id_id_key unique (ws_id, id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'finance_invoices_customer_workspace_fkey'
      and conrelid = 'public.finance_invoices'::regclass
  ) then
    alter table public.finance_invoices
      add constraint finance_invoices_customer_workspace_fkey
      foreign key (ws_id, customer_id)
      references public.workspace_users (ws_id, id)
      on update cascade
      on delete cascade
      not valid;
  end if;
end;
$$;

create or replace function public.search_finance_invoices(
  p_ws_id uuid,
  p_search_query text,
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_user_ids uuid[] default null,
  p_wallet_ids uuid[] default null,
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  id uuid,
  ws_id uuid,
  customer_id uuid,
  notice text,
  note text,
  price bigint,
  total_diff bigint,
  created_at timestamptz,
  creator_id uuid,
  platform_creator_id uuid,
  transaction_id uuid,
  customer_full_name text,
  customer_avatar_url text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total_count bigint;
  v_escaped_query text;
begin
  v_escaped_query := replace(replace(replace(p_search_query, '\', '\\'), '%', '\%'), '_', '\_');

  with filtered_invoices as (
    select distinct
      fi.id,
      fi.ws_id,
      fi.customer_id,
      fi.notice,
      fi.note,
      fi.price,
      fi.total_diff,
      fi.created_at,
      fi.creator_id,
      fi.platform_creator_id,
      fi.transaction_id,
      wu.full_name as customer_full_name,
      wu.avatar_url as customer_avatar_url
    from public.finance_invoices fi
    left join public.workspace_users wu
      on fi.customer_id = wu.id
      and fi.ws_id = wu.ws_id
    left join public.wallet_transactions wt on fi.transaction_id = wt.id
    where fi.ws_id = p_ws_id
      and (
        p_search_query is null or p_search_query = '' or
        fi.notice ilike '%' || v_escaped_query || '%' escape '\' or
        fi.note ilike '%' || v_escaped_query || '%' escape '\' or
        wu.full_name ilike '%' || v_escaped_query || '%' escape '\'
      )
      and (p_start_date is null or fi.created_at >= p_start_date)
      and (p_end_date is null or fi.created_at <= p_end_date)
      and (p_user_ids is null or fi.creator_id = any(p_user_ids))
      and (p_wallet_ids is null or wt.wallet_id = any(p_wallet_ids))
  )
  select count(*) into v_total_count from filtered_invoices;

  return query
  with filtered_invoices as (
    select distinct
      fi.id,
      fi.ws_id,
      fi.customer_id,
      fi.notice,
      fi.note,
      fi.price,
      fi.total_diff,
      fi.created_at,
      fi.creator_id,
      fi.platform_creator_id,
      fi.transaction_id,
      wu.full_name as customer_full_name,
      wu.avatar_url as customer_avatar_url
    from public.finance_invoices fi
    left join public.workspace_users wu
      on fi.customer_id = wu.id
      and fi.ws_id = wu.ws_id
    left join public.wallet_transactions wt on fi.transaction_id = wt.id
    where fi.ws_id = p_ws_id
      and (
        p_search_query is null or p_search_query = '' or
        fi.notice ilike '%' || v_escaped_query || '%' escape '\' or
        fi.note ilike '%' || v_escaped_query || '%' escape '\' or
        wu.full_name ilike '%' || v_escaped_query || '%' escape '\'
      )
      and (p_start_date is null or fi.created_at >= p_start_date)
      and (p_end_date is null or fi.created_at <= p_end_date)
      and (p_user_ids is null or fi.creator_id = any(p_user_ids))
      and (p_wallet_ids is null or wt.wallet_id = any(p_wallet_ids))
  )
  select
    fi_results.id,
    fi_results.ws_id,
    fi_results.customer_id,
    fi_results.notice,
    fi_results.note,
    fi_results.price,
    fi_results.total_diff,
    fi_results.created_at,
    fi_results.creator_id,
    fi_results.platform_creator_id,
    fi_results.transaction_id,
    fi_results.customer_full_name,
    fi_results.customer_avatar_url,
    v_total_count as total_count
  from filtered_invoices fi_results
  order by fi_results.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;
