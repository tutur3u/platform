set check_function_bodies = off;

CREATE OR REPLACE FUNCTION audit.disable_tracking(regclass)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare statement_row text = format(
        'drop trigger if exists audit_i_u_d on %s;',
        $1
    );
statement_stmt text = format(
    'drop trigger if exists audit_t on %s;',
    $1
);
begin execute statement_row;
execute statement_stmt;
end;
$function$
;

CREATE OR REPLACE FUNCTION audit.enable_tracking(regclass)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare statement_row text = format(
        '
        create trigger audit_i_u_d
            after insert or update or delete
            on %s
            for each row
            execute procedure audit.insert_update_delete_trigger();',
        $1
    );
statement_stmt text = format(
    '
        create trigger audit_t
            after truncate
            on %s
            for each statement
            execute procedure audit.truncate_trigger();',
    $1
);
pkey_cols text [] = audit.primary_key_columns($1);
begin if pkey_cols = array []::text [] then raise exception 'Table % can not be audited because it has no primary key',
$1;
end if;
if not exists(
    select 1
    from pg_trigger
    where tgrelid = $1
        and tgname = 'audit_i_u_d'
) then execute statement_row;
end if;
if not exists(
    select 1
    from pg_trigger
    where tgrelid = $1
        and tgname = 'audit_t'
) then execute statement_stmt;
end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION audit.get_ws_id(table_name text, record jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
AS $function$ BEGIN IF table_name = 'workspaces' THEN RETURN (record->>'id')::UUID;
END IF;
IF table_name = 'wallet_transactions' THEN RETURN (
    SELECT ws_id
    FROM public.workspace_wallets
    WHERE id = (record->>'wallet_id')::UUID
);
END IF;
IF table_name = 'calendar_event_platform_participants'
OR table_name = 'calendar_event_virtual_participants'
OR table_name = 'calendar_event_participant_groups' THEN RETURN (
    SELECT ws_id
    FROM public.workspace_calendar_events
    WHERE id = (record->>'event_id')::UUID
);
END IF;
RETURN (record->>'ws_id')::UUID;
END;
$function$
;

CREATE OR REPLACE FUNCTION audit.insert_update_delete_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare pkey_cols text [] = audit.primary_key_columns(TG_RELID);
record_jsonb jsonb = to_jsonb(new);
record_id uuid = audit.to_record_id(TG_RELID, pkey_cols, record_jsonb);
old_record_jsonb jsonb = to_jsonb(old);
old_record_id uuid = audit.to_record_id(TG_RELID, pkey_cols, old_record_jsonb);
begin
insert into audit.record_version(
        record_id,
        old_record_id,
        op,
        table_oid,
        table_schema,
        table_name,
        record,
        old_record
    )
select record_id,
    old_record_id,
    TG_OP::audit.operation,
    TG_RELID,
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    record_jsonb,
    old_record_jsonb;
return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION audit.primary_key_columns(entity_oid oid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ -- Looks up the names of a table's primary key columns
select coalesce(
        array_agg(
            pa.attname::text
            order by pa.attnum
        ),
        array []::text []
    ) column_names
from pg_index pi
    join pg_attribute pa on pi.indrelid = pa.attrelid
    and pa.attnum = any(pi.indkey)
where indrelid = $1
    and indisprimary $function$
;

CREATE OR REPLACE FUNCTION audit.to_record_id(entity_oid oid, pkey_cols text[], rec jsonb)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'extensions'
AS $function$
select case
        when rec is null then null
        when pkey_cols = array []::text [] then gen_random_uuid()
        else (
            select extensions.uuid_generate_v5(
                    'fd62bc3d-8d6e-43c2-919c-802ba3762271',
                    (
                        jsonb_build_array(to_jsonb($1)) || jsonb_agg($3->>key_)
                    )::text
                )
            from unnest($2) x(key_)
        )
    end $function$
;

CREATE OR REPLACE FUNCTION audit.truncate_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin
insert into audit.record_version(
        op,
        table_oid,
        table_schema,
        table_name
    )
select TG_OP::audit.operation,
    TG_RELID,
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME;
return coalesce(old, new);
end;
$function$
;


set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.add_ws_creator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.workspace_members(ws_id, user_id)
    VALUES (new.id, auth.uid());
  END IF;
  RETURN new;
END;$function$
;

CREATE OR REPLACE FUNCTION public.check_workspace_owners()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN -- Check if any rows in the affected workspace have OWNER role
    IF NOT EXISTS (
        SELECT 1
        FROM "public"."workspace_members"
        WHERE ws_id = NEW.ws_id
            AND role = 'OWNER'
    ) THEN -- If there are no OWNER roles, raise an error
    RAISE EXCEPTION 'Cannot update workspace_members: at least one OWNER role is required in the workspace';
END IF;
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_ai_chat(title text, message text, model text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare generated_chat_id uuid;
begin generated_chat_id := gen_random_uuid();
insert into ai_chats (id, title, creator_id, model)
values (generated_chat_id, title, auth.uid(), model);
insert into ai_chat_messages (chat_id, content, creator_id, role)
values (generated_chat_id, message, auth.uid(), 'USER');
return generated_chat_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ BEGIN
INSERT INTO public.users (id)
VALUES (NEW.id);
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_workspace_user_linked_user()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ begin if not exists (
        select 1
        from workspace_users wu
            join user_private_details up on wu.email = up.email
        where up.user_id = new.user_id
            and wu.ws_id = new.ws_id
    )
    and not exists (
        select 1
        from workspace_user_linked_users wul
        where wul.platform_user_id = new.user_id
            and wul.ws_id = new.ws_id
    ) then
insert into workspace_users (id, ws_id, display_name, email)
select gen_random_uuid(),
    new.ws_id,
    u.display_name,
    up.email
from users u
    join user_private_details up on up.user_id = u.id
where u.id = new.user_id;
insert into workspace_user_linked_users (platform_user_id, virtual_user_id, ws_id)
select new.user_id,
    wu.id,
    new.ws_id
from workspace_users wu
    join user_private_details up on up.email = wu.email
where up.user_id = new.user_id
    and wu.ws_id = new.ws_id;
end if;
return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_complementary_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN
DELETE FROM public.wallet_transactions
WHERE id = OLD.from_transaction_id
  OR id = OLD.to_transaction_id;
RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_invite_when_accepted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ begin -- Delete the invite
delete FROM public.workspace_invites i
WHERE i.ws_id = new.ws_id
  AND i.user_id = new.user_id;
return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_wallet_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN
DELETE FROM wallet_transactions wt
WHERE wt.id = OLD.transaction_id;
RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_workspace_member_when_unlink()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ begin
delete from workspace_members wm
where wm.user_id = old.platform_user_id
    and wm.ws_id = old.ws_id;
return old;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_finance_invoices_count(ws_id uuid)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.finance_invoices
WHERE ws_id = $1 $function$
;

CREATE OR REPLACE FUNCTION public.get_healthcare_checkups_count(ws_id uuid)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.healthcare_checkups
WHERE ws_id = $1 $function$
;

CREATE OR REPLACE FUNCTION public.get_healthcare_diagnoses_count(ws_id uuid)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.healthcare_diagnoses
WHERE ws_id = $1 $function$
;

CREATE OR REPLACE FUNCTION public.get_healthcare_vital_groups_count(ws_id uuid)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.healthcare_vital_groups
WHERE ws_id = $1 $function$
;

CREATE OR REPLACE FUNCTION public.get_healthcare_vitals_count(ws_id uuid)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.healthcare_vitals
WHERE ws_id = $1 $function$
;

CREATE OR REPLACE FUNCTION public.get_inventory_batches_count(ws_id uuid)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.inventory_batches wb
    INNER JOIN public.inventory_warehouses ww ON wb.warehouse_id = ww.id
WHERE ww.ws_id = $1 $function$
;

CREATE OR REPLACE FUNCTION public.get_inventory_product_categories_count(ws_id uuid)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.product_categories
WHERE ws_id = $1 $function$
;

CREATE OR REPLACE FUNCTION public.get_inventory_products(_category_ids uuid[] DEFAULT NULL::uuid[], _ws_id uuid DEFAULT NULL::uuid, _warehouse_ids uuid[] DEFAULT NULL::uuid[], _has_unit boolean DEFAULT NULL::boolean)
 RETURNS TABLE(id uuid, name text, manufacturer text, unit text, unit_id uuid, category text, price bigint, amount bigint, ws_id uuid, created_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$ BEGIN RETURN QUERY WITH inventory_products AS (
        SELECT *
        FROM inventory_products
        WHERE (warehouse_id = ANY(_warehouse_ids))
    )
SELECT p.id,
    p.name,
    p.manufacturer,
    iu.name AS unit,
    ip.unit_id,
    pc.name AS category,
    ip.price,
    COALESCE(ip.amount, 0) AS amount,
    p.ws_id,
    p.created_at
FROM workspace_products p
    LEFT JOIN inventory_products ip ON ip.product_id = p.id
    AND (
        ip.warehouse_id = ANY(_warehouse_ids)
        AND (
            ip.unit_id IS NOT NULL
            OR _has_unit IS FALSE
        )
    )
    LEFT JOIN inventory_units iu ON ip.unit_id = iu.id
    LEFT JOIN product_categories pc ON p.category_id = pc.id
WHERE (
        _category_ids IS NULL
        OR p.category_id = ANY(_category_ids)
    )
    AND (
        _ws_id IS NULL
        OR p.ws_id = _ws_id
    )
    AND (
        _has_unit IS NULL
        OR ip.unit_id IS NOT NULL
    )
ORDER BY p.name ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_inventory_products_count(ws_id uuid)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.inventory_products ip
    INNER JOIN public.workspace_products wp ON wp.id = ip.product_id
WHERE ws_id = $1 $function$
;

CREATE OR REPLACE FUNCTION public.get_inventory_suppliers_count(ws_id uuid)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.inventory_suppliers
WHERE ws_id = $1 $function$
;

CREATE OR REPLACE FUNCTION public.get_inventory_units_count(ws_id uuid)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.inventory_units
WHERE ws_id = $1 $function$
;

CREATE OR REPLACE FUNCTION public.get_inventory_warehouses_count(ws_id uuid)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.inventory_warehouses
WHERE ws_id = $1 $function$
;

CREATE OR REPLACE FUNCTION public.get_pending_event_participants(_event_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE participant_count integer;
BEGIN
SELECT COUNT(DISTINCT participant_id) INTO participant_count
FROM (
        SELECT p.participant_id
        FROM public.calendar_event_participants p
        WHERE p.event_id = _event_id
            AND (
                p.type <> 'user_group'
                AND p.going IS NULL
            )
        UNION ALL
        SELECT ugu.user_id
        FROM public.workspace_user_groups_users ugu
        WHERE ugu.group_id IN (
                SELECT wug.id
                FROM public.workspace_user_groups wug
                    JOIN public.calendar_event_participants p ON wug.id = p.participant_id
                WHERE p.event_id = _event_id
                    AND p.type = 'user_group'
                    AND p.going IS NULL
            )
            AND NOT EXISTS (
                SELECT 1
                FROM public.calendar_event_participants p
                WHERE p.event_id = _event_id
                    AND p.participant_id = ugu.user_id
                    AND p.type <> 'user_group'
            )
    ) AS subquery;
RETURN participant_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_transaction_categories_with_amount()
 RETURNS TABLE(id uuid, name text, is_expense boolean, ws_id uuid, created_at timestamp with time zone, amount bigint)
 LANGUAGE sql
AS $function$
SELECT transaction_categories.*,
    count(wallet_transactions.*) as amount
FROM transaction_categories
    LEFT JOIN wallet_transactions ON wallet_transactions.category_id = transaction_categories.id
GROUP BY transaction_categories.id $function$
;

CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid, ws_id uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE role text;
BEGIN
SELECT wm.role INTO role
FROM "public"."workspace_members" AS wm
WHERE wm.user_id = get_user_role.user_id
    AND wm.ws_id = get_user_role.ws_id;
RETURN COALESCE(role, 'MEMBER');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_products_count(ws_id uuid)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.workspace_products
WHERE ws_id = $1 $function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_transaction_categories_count(ws_id uuid)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.transaction_categories
WHERE ws_id = $1 $function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_transactions_count(ws_id uuid, start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, end_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
WHERE ww.ws_id = $1
    AND (
        (
            start_date IS NULL
            AND end_date IS NULL
        )
        OR (
            start_date IS NULL
            AND wt.taken_at <= $3
        )
        OR (
            end_date IS NULL
            AND wt.taken_at >= $2
        )
        OR (
            wt.taken_at BETWEEN $2 AND $3
        )
    ) $function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_user_groups_count(ws_id uuid)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.workspace_user_groups
WHERE ws_id = $1 $function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_users_count(ws_id uuid)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.workspace_users
WHERE ws_id = $1 $function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_wallets_count(ws_id uuid)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT COUNT(*)
FROM public.workspace_wallets
WHERE ws_id = $1 $function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_wallets_expense(ws_id uuid, start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, end_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT SUM(amount)
FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
WHERE ww.ws_id = $1
    AND wt.report_opt_in = true
    AND ww.report_opt_in = true
    AND wt.amount < 0
    AND (
        (
            start_date IS NULL
            AND end_date IS NULL
        )
        OR (
            start_date IS NULL
            AND wt.taken_at <= $3
        )
        OR (
            end_date IS NULL
            AND wt.taken_at >= $2
        )
        OR (
            wt.taken_at BETWEEN $2 AND $3
        )
    ) $function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_wallets_income(ws_id uuid, start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, end_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS numeric
 LANGUAGE sql
AS $function$
SELECT SUM(amount)
FROM public.wallet_transactions wt
    JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
WHERE ww.ws_id = $1
    AND wt.report_opt_in = true
    AND ww.report_opt_in = true
    AND wt.amount > 0
    AND (
        (
            start_date IS NULL
            AND end_date IS NULL
        )
        OR (
            start_date IS NULL
            AND wt.taken_at <= $3
        )
        OR (
            end_date IS NULL
            AND wt.taken_at >= $2
        )
        OR (
            wt.taken_at BETWEEN $2 AND $3
        )
    ) $function$
;

CREATE OR REPLACE FUNCTION public.has_other_owner(_ws_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM workspace_members
    WHERE ws_id = $1
      AND role = 'OWNER'::text
      AND user_id <> $2
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.insert_ai_chat_message(message text, chat_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ begin
insert into ai_chat_messages (chat_id, content, creator_id, role)
values (chat_id, message, auth.uid(), 'USER');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_member_invited(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$SELECT EXISTS (
  SELECT 1
  FROM workspace_invites wsi
  WHERE wsi.ws_id = _org_id
  AND wsi.user_id = _user_id
);
$function$
;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$SELECT EXISTS (
  SELECT 1
  FROM workspace_members wsm
  WHERE wsm.ws_id = _org_id
  AND wsm.user_id = _user_id
);$function$
;

CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM projects
  WHERE id = _project_id
);
$function$
;

CREATE OR REPLACE FUNCTION public.is_task_board_member(_user_id uuid, _board_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
SELECT EXISTS (
        SELECT 1
        FROM workspace_boards
        WHERE id = _board_id
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_user_task_in_board(_user_id uuid, _task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$SELECT EXISTS (
  SELECT 1
  FROM tasks, task_lists lists
  WHERE tasks.id = _task_id
  AND lists.id = tasks.list_id
);
$function$
;

CREATE OR REPLACE FUNCTION public.on_delete_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ BEGIN
UPDATE public.users
SET deleted = true
WHERE id = OLD.id;
DELETE FROM public.workspace_members
WHERE user_id = OLD.id;
RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_users_by_name(search_query text, result_limit integer DEFAULT 5, min_similarity double precision DEFAULT 0.3)
 RETURNS TABLE(id uuid, handle text, display_name text, avatar_url text, relevance double precision)
 LANGUAGE plpgsql
AS $function$ BEGIN RETURN QUERY
SELECT u.id,
    u.handle,
    u.display_name,
    u.avatar_url,
    GREATEST(
        similarity(u.handle, search_query),
        similarity(u.display_name, search_query)
    )::double precision AS relevance
FROM users u
WHERE u.deleted = false
    AND (
        similarity(u.handle, search_query) >= min_similarity
        OR similarity(u.display_name, search_query) >= min_similarity
    )
ORDER BY GREATEST(
        similarity(u.handle, search_query),
        similarity(u.display_name, search_query)
    ) DESC,
    u.created_at
LIMIT result_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_invoice_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  new_transaction_id uuid;
begin
  if (TG_OP = 'INSERT') then
    INSERT INTO public.wallet_transactions (amount, description, wallet_id, invoice_id, category_id, creator_id, created_at, taken_at)
    VALUES (NEW.price + NEW.total_diff, NEW.notice, NEW.wallet_id, NEW.id, NEW.category_id, NEW.creator_id, NEW.created_at, NEW.created_at)
    RETURNING id INTO new_transaction_id;
    
    UPDATE public.finance_invoices
    SET transaction_id = new_transaction_id
    WHERE id = NEW.id;
  elsif (TG_OP = 'UPDATE') then
    UPDATE public.wallet_transactions
    SET amount = NEW.price + NEW.total_diff,
        description = NEW.notice,
        wallet_id = NEW.wallet_id,
        category_id = NEW.category_id,
        creator_id = NEW.creator_id,
        created_at = NEW.created_at
    WHERE id = NEW.transaction_id;
  elsif (TG_OP = 'DELETE') then
    DELETE FROM public.wallet_transactions
    WHERE id = OLD.transaction_id;
  end if;
  RETURN NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_member_roles_from_invite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$ begin -- Copy role and role_title from invite to new member
  new.role := coalesce(
    (
      SELECT i.role
      FROM public.workspace_invites i
      WHERE i.ws_id = new.ws_id
        AND i.user_id = new.user_id
    ),
    new.role,
    'MEMBER'::text
  );
new.role_title := coalesce(
  (
    SELECT i.role_title
    FROM public.workspace_invites i
    WHERE i.ws_id = new.ws_id
      AND i.user_id = new.user_id
  ),
  new.role_title,
  ''::text
);
return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_transfer_transactions()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$DECLARE
    opposite_id uuid;
    is_from boolean;
    report_opt_in_value boolean;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        SELECT CASE
            WHEN wtt.from_transaction_id = OLD.id THEN wtt.to_transaction_id
            WHEN wtt.to_transaction_id = OLD.id THEN wtt.from_transaction_id
            ELSE NULL
        END INTO opposite_id
        FROM public.workspace_wallet_transfers wtt
        WHERE wtt.from_transaction_id = OLD.id
            OR wtt.to_transaction_id = OLD.id
        LIMIT 1;
        
        IF opposite_id IS NOT NULL THEN
            SELECT report_opt_in INTO report_opt_in_value
            FROM public.wallet_transactions
            WHERE id = NEW.id;
            
            UPDATE public.wallet_transactions wt
            SET amount = ABS(NEW.amount), report_opt_in = report_opt_in_value
            WHERE wt.id = opposite_id AND (wt.amount <> ABS(NEW.amount) OR wt.report_opt_in <> report_opt_in_value);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_user_details()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$DECLARE
BEGIN
  IF (TG_OP = 'INSERT') THEN
INSERT INTO
  public.users (id)
VALUES
  (NEW.id);

INSERT INTO
  public.user_private_details (user_id, email, new_email)
VALUES
  (NEW.id, NEW.email, NEW.email_change);

ELSIF (NEW.email <> OLD.email) THEN
UPDATE
  public.user_private_details
SET
  email = NEW.email
WHERE
  user_id = NEW.id;

END IF;

IF (NEW.email_change <> OLD.email_change) THEN
UPDATE
  public.user_private_details
SET
  new_email = NEW.email_change
WHERE
  user_id = NEW.id;

END IF;

RETURN NEW;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_user_private_details()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$BEGIN IF (TG_OP = 'INSERT') THEN
INSERT INTO public.user_private_details (user_id, email, new_email)
VALUES (NEW.id, NEW.email, NEW.email_change);
ELSIF (
  NEW.email <> OLD.email
  OR NEW.email_change <> OLD.email_change
) THEN
UPDATE public.user_private_details
SET email = NEW.email,
  new_email = NEW.email_change
WHERE user_id = NEW.id;
END IF;
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.transactions_have_same_abs_amount(transaction_id_1 uuid, transaction_id_2 uuid)
 RETURNS boolean
 LANGUAGE sql
AS $function$
SELECT ABS(t1.amount) = ABS(t2.amount)
FROM wallet_transactions t1,
  wallet_transactions t2
WHERE t1.id = transaction_id_1
  AND t2.id = transaction_id_2 $function$
;

CREATE OR REPLACE FUNCTION public.transactions_have_same_amount(transaction_id_1 uuid, transaction_id_2 uuid)
 RETURNS boolean
 LANGUAGE sql
AS $function$
SELECT t1.amount = t2.amount
FROM wallet_transactions t1,
  wallet_transactions t2
WHERE t1.id = transaction_id_1
  AND t2.id = transaction_id_2 $function$
;

CREATE OR REPLACE FUNCTION public.update_inventory_product_amount()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN IF (TG_OP = 'INSERT') THEN
UPDATE inventory_products ip
SET amount = ip.amount + NEW.amount
WHERE ip.product_id = NEW.product_id
    AND ip.unit_id = NEW.unit_id
    AND ip.warehouse_id = (
        SELECT warehouse_id
        FROM inventory_batches ib
        WHERE ib.id = NEW.batch_id
    );
ELSIF (TG_OP = 'UPDATE') THEN
UPDATE inventory_products ip
SET amount = ip.amount - OLD.amount + NEW.amount
WHERE ip.product_id = NEW.product_id
    AND ip.unit_id = NEW.unit_id
    AND ip.warehouse_id = (
        SELECT warehouse_id
        FROM inventory_batches ib
        WHERE ib.id = NEW.batch_id
    );
ELSIF (TG_OP = 'DELETE') THEN
UPDATE inventory_products ip
SET amount = ip.amount - OLD.amount
WHERE ip.product_id = OLD.product_id
    AND ip.unit_id = OLD.unit_id
    AND ip.warehouse_id = (
        SELECT warehouse_id
        FROM inventory_batches ib
        WHERE ib.id = OLD.batch_id
    );
END IF;
RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_inventory_products_from_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN IF TG_OP = 'INSERT' THEN
UPDATE inventory_products ip
SET amount = ip.amount - NEW.amount
WHERE ip.product_id = NEW.product_id
    AND ip.unit_id = NEW.unit_id
    AND ip.warehouse_id = NEW.warehouse_id;
ELSIF TG_OP = 'UPDATE' THEN
UPDATE inventory_products ip
SET amount = ip.amount - NEW.amount + OLD.amount
WHERE ip.product_id = NEW.product_id
    AND ip.unit_id = NEW.unit_id
    AND ip.warehouse_id = NEW.warehouse_id;
ELSIF TG_OP = 'DELETE' THEN
UPDATE inventory_products ip
SET amount = ip.amount + OLD.amount
WHERE ip.product_id = OLD.product_id
    AND ip.unit_id = OLD.unit_id
    AND ip.warehouse_id = OLD.warehouse_id;
END IF;
RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_invoice_products_warehouse()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN IF (
        TG_OP = 'INSERT'
        OR TG_OP = 'UPDATE'
    ) THEN NEW.warehouse = COALESCE(
        (
            SELECT name
            FROM inventory_warehouses
            WHERE id = NEW.warehouse_id
        ),
        OLD.warehouse
    );
RETURN NEW;
ELSIF (TG_OP = 'DELETE') THEN RETURN OLD;
END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_transaction_amount()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.workspace_wallet_transfers wtt
        WHERE wtt.from_transaction_id = NEW.id
    ) AND NEW.amount > 0 THEN
        NEW.amount = -NEW.amount;
    END IF;
    
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_wallet_balance()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$BEGIN 
    IF TG_OP = 'INSERT' THEN
        UPDATE workspace_wallets
        SET balance = balance + NEW.amount
        WHERE id = NEW.wallet_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.wallet_id = NEW.wallet_id THEN
            UPDATE workspace_wallets
            SET balance = balance - OLD.amount + NEW.amount
            WHERE id = OLD.wallet_id;
        ELSE
            UPDATE workspace_wallets
            SET balance = balance - OLD.amount
            WHERE id = OLD.wallet_id;
            
            UPDATE workspace_wallets
            SET balance = balance + NEW.amount
            WHERE id = NEW.wallet_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE workspace_wallets
        SET balance = balance - OLD.amount
        WHERE id = OLD.wallet_id;
    END IF;
    RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_wallet_transaction_amount()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN IF (TG_OP = 'UPDATE') THEN IF (
        (NEW.price + NEW.total_diff) <> (OLD.price + OLD.total_diff)
    ) THEN
UPDATE public.wallet_transactions
SET amount = CASE
        WHEN tc.is_expense THEN -(NEW.price + NEW.total_diff)
        ELSE (NEW.price + NEW.total_diff)
    END
FROM public.transaction_categories tc
WHERE tc.id = wallet_transactions.category_id
    AND wallet_transactions.id = NEW.transaction_id;
END IF;
END IF;
RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_wallet_transactions()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN IF (OLD.is_expense <> NEW.is_expense) THEN IF (NEW.is_expense = true) THEN
UPDATE public.wallet_transactions
SET amount = - amount
WHERE category_id = NEW.id
    AND amount > 0;
UPDATE public.wallet_transactions
SET amount = amount
WHERE category_id = NEW.id
    AND amount < 0;
ELSE
UPDATE public.wallet_transactions
SET amount = - amount
WHERE category_id = NEW.id
    AND amount < 0;
UPDATE public.wallet_transactions
SET amount = amount
WHERE category_id = NEW.id
    AND amount > 0;
END IF;
END IF;
RETURN NEW;
END;
$function$
;


