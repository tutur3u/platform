-- Attach a synthetic persisted ingress event to an existing fixture message.
create function pg_temp.bind_inbound_mail_fixture(target_message_id uuid)
returns void
language sql
as $$
  with context as (
    select
      m.id,
      m.provider,
      coalesce(m.raw_message_id, gen_random_uuid()) as raw_id,
      'fixture-' || m.id::text as provider_id,
      d.id as ingress_id,
      d.domain,
      b.address
    from private.mail_messages m
    join private.mail_mailboxes b on b.id = m.mailbox_id
    join private.mail_domains d on d.id = b.domain_id
    where m.id = target_message_id and m.provider in ('ses', 'cloudflare')
  ), ingress as (
    insert into private.mail_raw_messages (
      id, provider, provider_message_id, status, provider_payload
    )
    select
      raw_id, provider, provider_id, 'imported',
      case when provider = 'ses' then
        jsonb_build_object('receipt', jsonb_build_object('recipients', jsonb_build_array(address)))
      else
        jsonb_build_object(
          'canonicalDomain', domain,
          'ingressDomain', domain,
          'envelope', jsonb_build_object('to', address, 'observedTo', address)
        )
      end
    from context
    on conflict (id) do update set
      provider = excluded.provider,
      provider_message_id = excluded.provider_message_id,
      status = excluded.status,
      provider_payload = excluded.provider_payload
    returning id
  )
  update private.mail_messages m
  set raw_message_id = ingress.id,
      provider_message_id = context.provider_id,
      ingress_domain_id = context.ingress_id,
      envelope_to = context.address,
      observed_recipient = context.address
  from context join ingress on ingress.id = context.raw_id
  where m.id = context.id;
$$;
