create or replace function public.strict_text_field_char_limit(
  _table_name text,
  _column_name text
)
returns integer
language sql
immutable
as $$
  select case
    when lower(_table_name) = 'users' and lower(_column_name) = 'display_name' then 64
    when lower(_table_name) = 'users' and lower(_column_name) = 'bio' then 160
    when lower(_table_name) = 'workspaces' and lower(_column_name) = 'name' then 63
    when lower(_table_name) = 'tasks' and lower(_column_name) = 'name' then 128
    when lower(_table_name) = 'tasks' and lower(_column_name) = 'description' then 100000
    when lower(_table_name) = 'email_audit' and lower(_column_name) like '%content%' then 1048576
    when lower(_table_name) = 'sent_emails' and lower(_column_name) like '%content%' then 1048576
    when lower(_table_name) = 'workspace_calendar_events' and lower(_column_name) = 'title' then 128
    when lower(_table_name) = 'workspace_calendar_events' and lower(_column_name) = 'description' then 512
    when lower(_table_name) = 'support_inquiries' and lower(_column_name) = 'name' then 64
    when lower(_table_name) = 'support_inquiries' and lower(_column_name) = 'subject' then 128
    when lower(_table_name) = 'support_inquiries' and lower(_column_name) = 'message' then 512
    when lower(_table_name) = 'workspace_chat_channels' and lower(_column_name) = 'name' then 64
    when lower(_table_name) = 'workspace_chat_channels' and lower(_column_name) = 'description' then 256
    when lower(_table_name) = 'workspace_chat_messages' and lower(_column_name) = 'content' then 512
    when lower(_table_name) = 'workspace_secrets' and lower(_column_name) = 'value' then 4096
    when lower(_table_name) = 'internal_email_api_keys' and lower(_column_name) = 'value' then 4096
    when lower(_table_name) = 'workspace_whiteboards' and lower(_column_name) = 'title' then 120
    when lower(_table_name) = 'workspace_whiteboards' and lower(_column_name) = 'description' then 500
    when lower(_column_name) like '%email%' then 320
    when lower(_column_name) = 'id'
      or lower(_column_name) like '%\_id' escape '\' then 255
    when lower(_column_name) like '%token%' then 2048
    when lower(_column_name) like '%hash%'
      or lower(_column_name) like '%salt%' then 512
    when lower(_column_name) = 'user_agent'
      or lower(_column_name) like '%agent%' then 512
    when lower(_column_name) = 'endpoint' then 1024
    when lower(_column_name) = 'html'
      or lower(_column_name) like '%html%' then 4096
    when lower(_column_name) = 'text'
      or lower(_column_name) like '%\_text' escape '\' then 512
    when lower(_column_name) = 'input'
      or lower(_column_name) = 'output'
      or lower(_column_name) = 'data'
      or lower(_column_name) like '%\_input' escape '\'
      or lower(_column_name) like '%\_output' escape '\' then 512
    when lower(_column_name) like '%slug%'
      or lower(_column_name) like '%handle%'
      or lower(_column_name) like '%username%'
      or lower(_column_name) like '%shortcode%'
      or lower(_column_name) like '%otp%'
      or lower(_column_name) like '%code%' then 80
    when lower(_column_name) like '%url%'
      or lower(_column_name) like '%link%'
      or lower(_column_name) like '%path%' then 2048
    when lower(_column_name) = 'ip'
      or lower(_column_name) like 'ip\_%' escape '\'
      or lower(_column_name) like '%\_ip' escape '\'
      or lower(_column_name) like '%ip_address%' then 45
    when lower(_column_name) like '%locale%'
      or lower(_column_name) like '%timezone%'
      or lower(_column_name) like '%provider%'
      or lower(_column_name) like '%status%'
      or lower(_column_name) like '%type%'
      or lower(_column_name) like '%period%'
      or lower(_column_name) like '%color%' then 64
    when lower(_column_name) = 'name'
      or lower(_column_name) = 'title'
      or lower(_column_name) = 'subject'
      or lower(_column_name) like '%\_name' escape '\'
      or lower(_column_name) like '%\_title' escape '\' then 128
    when lower(_column_name) like '%summary%'
      or lower(_column_name) like '%description%'
      or lower(_column_name) like '%bio%'
      or lower(_column_name) like '%note%'
      or lower(_column_name) like '%reason%'
      or lower(_column_name) like '%hint%' then 512
    when lower(_column_name) like '%content%'
      or lower(_column_name) like '%message%'
      or lower(_column_name) like '%prompt%'
      or lower(_column_name) like '%body%' then 512
    else 512
  end;
$$;

create or replace function public.strict_text_field_byte_limit(
  _table_name text,
  _column_name text
)
returns integer
language sql
immutable
as $$
  select case
    when lower(_table_name) = 'email_audit' and lower(_column_name) like '%content%' then 4194304
    when lower(_table_name) = 'sent_emails' and lower(_column_name) like '%content%' then 4194304
    when lower(_column_name) like '%email%' then 320
    when lower(_column_name) like '%token%' then 4096
    when lower(_column_name) like '%hash%'
      or lower(_column_name) like '%salt%' then 1024
    when lower(_column_name) = 'user_agent'
      or lower(_column_name) like '%agent%' then 1024
    when lower(_column_name) = 'endpoint' then 2048
    when lower(_column_name) = 'html'
      or lower(_column_name) like '%html%' then 16384
    when lower(_column_name) = 'text'
      or lower(_column_name) like '%\_text' escape '\' then 2048
    when lower(_column_name) = 'input'
      or lower(_column_name) = 'output'
      or lower(_column_name) = 'data'
      or lower(_column_name) like '%\_input' escape '\'
      or lower(_column_name) like '%\_output' escape '\' then 2048
    when lower(_column_name) like '%url%'
      or lower(_column_name) like '%link%'
      or lower(_column_name) like '%path%' then 2048
    when lower(_column_name) = 'ip'
      or lower(_column_name) like 'ip\_%' escape '\'
      or lower(_column_name) like '%\_ip' escape '\'
      or lower(_column_name) like '%ip_address%' then 64
    else public.strict_text_field_char_limit(_table_name, _column_name) * 4
  end;
$$;

create or replace function public.strict_payload_field_byte_limit(
  _table_name text,
  _column_name text
)
returns integer
language sql
immutable
as $$
  select case
    when lower(_table_name) = 'workspace_whiteboards'
      and lower(_column_name) = 'snapshot' then 65536
    when lower(_table_name) = 'email_audit' and lower(_column_name) like '%content%' then 4194304
    when lower(_table_name) = 'sent_emails' and lower(_column_name) like '%content%' then 4194304
    when lower(_column_name) = 'content'
      or lower(_column_name) like '%\_content' escape '\'
      or lower(_column_name) like '%record%'
      or lower(_column_name) like '%snapshot%'
      or lower(_column_name) like '%segments%'
      or lower(_column_name) like '%instruction%'
      or lower(_column_name) like '%settings%'
      or lower(_column_name) like '%theme%'
      or lower(_column_name) like '%session_data%'
      or lower(_column_name) like '%agenda%'
      or lower(_column_name) like '%cells%'
      or lower(_column_name) like '%statuses%' then 65536
    when lower(_column_name) like '%metadata%'
      or lower(_column_name) like '%data%'
      or lower(_column_name) like '%json%'
      or lower(_column_name) like '%fields%'
      or lower(_column_name) like '%condition%'
      or lower(_column_name) like '%groups%'
      or lower(_column_name) like '%tags%'
      or lower(_column_name) like '%scores%'
      or lower(_column_name) like '%notification%'
      or lower(_column_name) like '%adjustments%'
      or lower(_column_name) like '%deductions%' then 16384
    else 8192
  end;
$$;
