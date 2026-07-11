with latest_subjects as (
  select distinct on (message.thread_id)
    message.thread_id,
    message.subject
  from private.mail_messages as message
  where message.thread_id is not null
    and nullif(btrim(message.subject), '') is not null
    and lower(btrim(message.subject)) <> '(no subject)'
  order by message.thread_id, coalesce(message.sent_at, message.received_at, message.created_at) desc
)
update private.mail_threads as thread
set
  subject = latest.subject,
  normalized_subject = lower(
    btrim(regexp_replace(latest.subject, '^(re|fw|fwd):\s*', '', 'i'))
  )
from latest_subjects as latest
where latest.thread_id = thread.id
  and (
    nullif(btrim(thread.subject), '') is null
    or lower(btrim(thread.subject)) = '(no subject)'
  );

comment on column private.mail_threads.subject is
  'Conversation subject. Message-ID headers remain authoritative for threading; normalized_subject is search fallback only.';
