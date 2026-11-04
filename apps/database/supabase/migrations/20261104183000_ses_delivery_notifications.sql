-- SES bounce and complaint notifications delivered through SNS.
-- Receipts make each SNS message idempotent; no message body or address is
-- stored in them. Hard bounces and complaints go into public.email_blacklist,
-- the store EmailService already checks before every send. Every bounce and
-- complaint is also recorded in private.email_bounce_complaints by address hash
-- (the platform's 16-character sha256 form). Policy notice ledger rows sent
-- with the same SES message id become 'bounced' or 'complained'.
-- Rollback: apps/database/rollbacks/20261104183000_ses_delivery_notifications.rollback.sql

create table if not exists private.ses_notification_receipts (
    sns_message_id text primary key
        check (char_length(sns_message_id) between 1 and 128),
    topic_arn text not null check (char_length(topic_arn) between 1 and 256),
    kind text not null check (kind in ('bounce', 'complaint')),
    received_at timestamptz not null default now()
);

alter table private.ses_notification_receipts enable row level security;
revoke all on table private.ses_notification_receipts
    from public, anon, authenticated;
grant select, insert on table private.ses_notification_receipts to service_role;

create or replace function private.record_ses_notification(
    p_sns_message_id text,
    p_topic_arn text,
    p_kind text,
    p_bounce_type text,
    p_detail text,
    p_ses_message_id text,
    p_recipients text[]
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
    v_rows integer;
    v_email text;
    v_suppress boolean;
begin
    if p_kind is null or p_kind not in ('bounce', 'complaint') then
        raise exception 'ses_notification:invalid_kind' using errcode = '22023';
    end if;
    if p_kind = 'bounce' and (
        p_bounce_type is null
        or p_bounce_type not in ('Permanent', 'Transient', 'Undetermined')
    ) then
        raise exception 'ses_notification:invalid_bounce_type' using errcode = '22023';
    end if;
    if p_recipients is null
        or cardinality(p_recipients) = 0
        or cardinality(p_recipients) > 50 then
        raise exception 'ses_notification:invalid_recipients' using errcode = '22023';
    end if;

    insert into private.ses_notification_receipts (sns_message_id, topic_arn, kind)
    values (p_sns_message_id, p_topic_arn, p_kind)
    on conflict (sns_message_id) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
        return 'duplicate';
    end if;

    -- Transient and undetermined bounces are recorded but never suppress.
    v_suppress := p_kind = 'complaint' or p_bounce_type = 'Permanent';

    foreach v_email in array p_recipients loop
        v_email := lower(btrim(v_email));
        continue when v_email is null or v_email = '';

        insert into private.email_bounce_complaints (
            email_hash, event_type, bounce_type, bounce_subtype, complaint_type
        )
        values (
            left(encode(sha256(convert_to(v_email, 'UTF8')), 'hex'), 16),
            p_kind,
            case p_bounce_type
                when 'Permanent' then 'hard'
                when 'Transient' then 'transient'
                when 'Undetermined' then 'soft'
            end,
            case when p_kind = 'bounce' then left(p_detail, 64) end,
            case when p_kind = 'complaint' then left(p_detail, 64) end
        );

        -- Same address rule as email_blacklist_email_format_check; an existing
        -- entry (any reason) already suppresses the address.
        if v_suppress and v_email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$' then
            insert into public.email_blacklist (entry_type, value, reason)
            values (
                'email',
                v_email,
                case p_kind
                    when 'complaint' then 'ses_complaint'
                    else 'ses_hard_bounce'
                end
            )
            on conflict (entry_type, value) do nothing;
        end if;
    end loop;

    if p_ses_message_id is not null then
        if p_kind = 'complaint' then
            update private.policy_notice_deliveries
            set status = 'complained', updated_at = now()
            where ses_message_id = p_ses_message_id
                and status in ('sent', 'bounced');
        elsif p_bounce_type = 'Permanent' then
            update private.policy_notice_deliveries
            set status = 'bounced', updated_at = now()
            where ses_message_id = p_ses_message_id
                and status = 'sent';
        end if;
    end if;

    return 'recorded';
end;
$$;

revoke all on function private.record_ses_notification(text, text, text, text, text, text, text[])
    from public, anon, authenticated;
grant execute on function private.record_ses_notification(text, text, text, text, text, text, text[])
    to service_role;
