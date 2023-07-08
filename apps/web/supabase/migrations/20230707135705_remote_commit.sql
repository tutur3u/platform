set check_function_bodies = off;
CREATE OR REPLACE FUNCTION audit.disable_tracking(regclass) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO '' AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION audit.enable_tracking(regclass) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO '' AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION audit.get_ws_id(table_name text, record jsonb) RETURNS uuid LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $function$ BEGIN IF table_name = 'workspaces' THEN RETURN (record->>'id')::UUID;
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
$function$;
CREATE OR REPLACE FUNCTION audit.insert_update_delete_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION audit.primary_key_columns(entity_oid oid) RETURNS text [] LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO '' AS $function$ -- Looks up the names of a table's primary key columns
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
    and indisprimary $function$;
CREATE OR REPLACE FUNCTION audit.to_record_id(entity_oid oid, pkey_cols text [], rec jsonb) RETURNS uuid LANGUAGE sql STABLE AS $function$
select case
        when rec is null then null
        when pkey_cols = array []::text [] then uuid_generate_v4()
        else (
            select uuid_generate_v5(
                    'fd62bc3d-8d6e-43c2-919c-802ba3762271',
                    (
                        jsonb_build_array(to_jsonb($1)) || jsonb_agg($3->>key_)
                    )::text
                )
            from unnest($2) x(key_)
        )
    end $function$;
CREATE OR REPLACE FUNCTION audit.truncate_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO '' AS $function$ begin
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
$function$;
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.add_ws_creator() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$BEGIN IF auth.uid() IS NOT NULL THEN
INSERT INTO public.workspace_members(ws_id, user_id)
VALUES (new.id, auth.uid());
END IF;
RETURN new;
END;
$function$;
CREATE OR REPLACE FUNCTION public.create_user_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$ BEGIN
INSERT INTO public.users (id)
VALUES (NEW.id);
RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.delete_complementary_transaction() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN
DELETE FROM public.wallet_transactions
WHERE id = OLD.from_transaction_id
    OR id = OLD.to_transaction_id;
RETURN OLD;
END;
$function$;
CREATE OR REPLACE FUNCTION public.delete_invite_when_accepted() RETURNS trigger LANGUAGE plpgsql AS $function$begin
delete FROM public.workspace_invites i
WHERE i.ws_id = new.ws_id
    AND i.user_id = new.user_id;
return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.delete_wallet_transaction() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN
DELETE FROM wallet_transactions wt
WHERE wt.id = OLD.transaction_id;
RETURN OLD;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_finance_invoices_count(ws_id uuid) RETURNS numeric LANGUAGE sql AS $function$
SELECT COUNT(*)
FROM public.finance_invoices
WHERE ws_id = $1 $function$;
CREATE OR REPLACE FUNCTION public.get_healthcare_checkups_count(ws_id uuid) RETURNS numeric LANGUAGE sql AS $function$
SELECT COUNT(*)
FROM public.healthcare_checkups
WHERE ws_id = $1 $function$;
CREATE OR REPLACE FUNCTION public.get_healthcare_diagnoses_count(ws_id uuid) RETURNS numeric LANGUAGE sql AS $function$
SELECT COUNT(*)
FROM public.healthcare_diagnoses
WHERE ws_id = $1 $function$;
CREATE OR REPLACE FUNCTION public.get_healthcare_vital_groups_count(ws_id uuid) RETURNS numeric LANGUAGE sql AS $function$
SELECT COUNT(*)
FROM public.healthcare_vital_groups
WHERE ws_id = $1 $function$;
CREATE OR REPLACE FUNCTION public.get_healthcare_vitals_count(ws_id uuid) RETURNS numeric LANGUAGE sql AS $function$
SELECT COUNT(*)
FROM public.healthcare_vitals
WHERE ws_id = $1 $function$;
CREATE OR REPLACE FUNCTION public.get_inventory_batches_count(ws_id uuid) RETURNS numeric LANGUAGE sql AS $function$
SELECT COUNT(*)
FROM public.inventory_batches wb
    INNER JOIN public.inventory_warehouses ww ON wb.warehouse_id = ww.id
WHERE ww.ws_id = $1 $function$;
CREATE OR REPLACE FUNCTION public.get_inventory_product_categories_count(ws_id uuid) RETURNS numeric LANGUAGE sql AS $function$
SELECT COUNT(*)
FROM public.product_categories
WHERE ws_id = $1 $function$;
CREATE OR REPLACE FUNCTION public.get_inventory_products(
        _category_ids uuid [] DEFAULT NULL::uuid [],
        _ws_id uuid DEFAULT NULL::uuid,
        _warehouse_ids uuid [] DEFAULT NULL::uuid [],
        _has_unit boolean DEFAULT NULL::boolean
    ) RETURNS TABLE(
        id uuid,
        name text,
        manufacturer text,
        unit text,
        unit_id uuid,
        category text,
        price bigint,
        amount bigint,
        ws_id uuid,
        created_at timestamp with time zone
    ) LANGUAGE plpgsql AS $function$ BEGIN RETURN QUERY WITH inventory_products AS (
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
$function$;
CREATE OR REPLACE FUNCTION public.get_inventory_products_count(ws_id uuid) RETURNS numeric LANGUAGE sql AS $function$
SELECT COUNT(*)
FROM public.inventory_products ip
    INNER JOIN public.workspace_products wp ON wp.id = ip.product_id
WHERE ws_id = $1 $function$;
CREATE OR REPLACE FUNCTION public.get_inventory_suppliers_count(ws_id uuid) RETURNS numeric LANGUAGE sql AS $function$
SELECT COUNT(*)
FROM public.inventory_suppliers
WHERE ws_id = $1 $function$;
CREATE OR REPLACE FUNCTION public.get_inventory_units_count(ws_id uuid) RETURNS numeric LANGUAGE sql AS $function$
SELECT COUNT(*)
FROM public.inventory_units
WHERE ws_id = $1 $function$;
CREATE OR REPLACE FUNCTION public.get_inventory_warehouses_count(ws_id uuid) RETURNS numeric LANGUAGE sql AS $function$
SELECT COUNT(*)
FROM public.inventory_warehouses
WHERE ws_id = $1 $function$;
CREATE OR REPLACE FUNCTION public.get_pending_event_participants(_event_id uuid) RETURNS integer LANGUAGE plpgsql AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.get_workspace_products_count(ws_id uuid) RETURNS numeric LANGUAGE sql AS $function$
SELECT COUNT(*)
FROM public.workspace_products
WHERE ws_id = $1 $function$;
CREATE OR REPLACE FUNCTION public.get_workspace_transaction_categories_count(ws_id uuid) RETURNS numeric LANGUAGE sql AS $function$
SELECT COUNT(*)
FROM public.transaction_categories
WHERE ws_id = $1 $function$;
CREATE OR REPLACE FUNCTION public.get_workspace_transactions_count(
        ws_id uuid,
        start_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
        end_date timestamp with time zone DEFAULT NULL::timestamp with time zone
    ) RETURNS numeric LANGUAGE sql AS $function$
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
    ) $function$;
CREATE OR REPLACE FUNCTION public.get_workspace_user_groups_count(ws_id uuid) RETURNS numeric LANGUAGE sql AS $function$
SELECT COUNT(*)
FROM public.workspace_user_groups
WHERE ws_id = $1 $function$;
CREATE OR REPLACE FUNCTION public.get_workspace_users_count(ws_id uuid) RETURNS numeric LANGUAGE sql AS $function$
SELECT COUNT(*)
FROM public.workspace_users
WHERE ws_id = $1 $function$;
CREATE OR REPLACE FUNCTION public.get_workspace_wallets_count(ws_id uuid) RETURNS numeric LANGUAGE sql AS $function$
SELECT COUNT(*)
FROM public.workspace_wallets
WHERE ws_id = $1 $function$;
CREATE OR REPLACE FUNCTION public.get_workspace_wallets_expense(
        ws_id uuid,
        start_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
        end_date timestamp with time zone DEFAULT NULL::timestamp with time zone
    ) RETURNS numeric LANGUAGE sql AS $function$
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
    ) $function$;
CREATE OR REPLACE FUNCTION public.get_workspace_wallets_income(
        ws_id uuid,
        start_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
        end_date timestamp with time zone DEFAULT NULL::timestamp with time zone
    ) RETURNS numeric LANGUAGE sql AS $function$
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
    ) $function$;
CREATE OR REPLACE FUNCTION public.has_other_owner(_ws_id uuid, _user_id uuid) RETURNS boolean LANGUAGE plpgsql AS $function$ BEGIN RETURN EXISTS (
        SELECT 1
        FROM workspace_members
        WHERE ws_id = $1
            AND role = 'OWNER'::text
            AND user_id <> $2
    );
END;
$function$;
CREATE OR REPLACE FUNCTION public.is_member_invited(_user_id uuid, _org_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $function$SELECT EXISTS (
        SELECT 1
        FROM workspace_invites wsi
        WHERE wsi.ws_id = _org_id
            AND wsi.user_id = _user_id
    );
$function$;
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $function$SELECT EXISTS (
        SELECT 1
        FROM workspace_members wsm
        WHERE wsm.ws_id = _org_id
            AND wsm.user_id = _user_id
    );
$function$;
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $function$
SELECT EXISTS (
        SELECT 1
        FROM projects
        WHERE id = _project_id
    );
$function$;
CREATE OR REPLACE FUNCTION public.is_task_board_member(_user_id uuid, _board_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $function$
SELECT EXISTS (
        SELECT 1
        FROM project_boards
        WHERE id = _board_id
    );
$function$;
CREATE OR REPLACE FUNCTION public.search_users_by_name(search_query character varying) RETURNS TABLE(
        id uuid,
        handle text,
        display_name text,
        avatar_url text
    ) LANGUAGE plpgsql AS $function$ begin return query
SELECT u.id,
    u.handle,
    u.display_name,
    u.avatar_url
FROM public.users u
WHERE search_query % ANY(STRING_TO_ARRAY(u.handle, ' '))
    OR search_query % ANY(STRING_TO_ARRAY(u.display_name, ' '))
ORDER BY u.created_at
LIMIT 5;
end;
$function$;
CREATE OR REPLACE FUNCTION public.sync_transfer_transactions() RETURNS trigger LANGUAGE plpgsql AS $function$DECLARE opposite_id uuid;
is_from boolean;
report_opt_in_value boolean;
BEGIN IF TG_OP = 'UPDATE' THEN
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
SET amount = ABS(NEW.amount),
    report_opt_in = report_opt_in_value
WHERE wt.id = opposite_id
    AND (
        wt.amount <> ABS(NEW.amount)
        OR wt.report_opt_in <> report_opt_in_value
    );
END IF;
END IF;
RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_user_details() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$DECLARE BEGIN IF (TG_OP = 'INSERT') THEN
INSERT INTO public.users (id)
VALUES (NEW.id);
INSERT INTO public.user_private_details (user_id, email, new_email)
VALUES (NEW.id, NEW.email, NEW.email_change);
ELSIF (NEW.email <> OLD.email) THEN
UPDATE public.user_private_details
SET email = NEW.email
WHERE user_id = NEW.id;
END IF;
IF (NEW.email_change <> OLD.email_change) THEN
UPDATE public.user_private_details
SET new_email = NEW.email_change
WHERE user_id = NEW.id;
END IF;
RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_user_private_details() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$ BEGIN IF (TG_OP = 'INSERT') THEN
INSERT INTO public.user_private_details (user_id, email, new_email)
VALUES (NEW.id, NEW.email, NEW.email_change);
ELSIF (NEW.email_change <> OLD.email_change) THEN
UPDATE public.user_private_details
SET new_email = NEW.email_change
WHERE user_id = NEW.id;
END IF;
RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.transactions_have_same_abs_amount(transaction_id_1 uuid, transaction_id_2 uuid) RETURNS boolean LANGUAGE sql AS $function$
SELECT ABS(t1.amount) = ABS(t2.amount)
FROM wallet_transactions t1,
    wallet_transactions t2
WHERE t1.id = transaction_id_1
    AND t2.id = transaction_id_2 $function$;
CREATE OR REPLACE FUNCTION public.transactions_have_same_amount(transaction_id_1 uuid, transaction_id_2 uuid) RETURNS boolean LANGUAGE sql AS $function$
SELECT t1.amount = t2.amount
FROM wallet_transactions t1,
    wallet_transactions t2
WHERE t1.id = transaction_id_1
    AND t2.id = transaction_id_2 $function$;
CREATE OR REPLACE FUNCTION public.update_inventory_product_amount() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN IF (TG_OP = 'INSERT') THEN
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
$function$;
CREATE OR REPLACE FUNCTION public.update_inventory_products_from_invoice() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN IF TG_OP = 'INSERT' THEN
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
$function$;
CREATE OR REPLACE FUNCTION public.update_transaction_amount() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN IF EXISTS (
        SELECT 1
        FROM public.workspace_wallet_transfers wtt
        WHERE wtt.from_transaction_id = NEW.id
    )
    AND NEW.amount > 0 THEN NEW.amount = - NEW.amount;
END IF;
RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_wallet_balance() RETURNS trigger LANGUAGE plpgsql AS $function$BEGIN IF TG_OP = 'INSERT' THEN
UPDATE workspace_wallets
SET balance = balance + NEW.amount
WHERE id = NEW.wallet_id;
ELSIF TG_OP = 'UPDATE' THEN IF OLD.wallet_id = NEW.wallet_id THEN
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
$function$;
CREATE OR REPLACE FUNCTION public.update_wallet_transaction_amount() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN IF (TG_OP = 'UPDATE') THEN IF (
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
$function$;
CREATE OR REPLACE FUNCTION public.update_wallet_transactions() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN IF (OLD.is_expense <> NEW.is_expense) THEN IF (NEW.is_expense = true) THEN
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
$function$;
DROP FUNCTION IF EXISTS sync_user_details();