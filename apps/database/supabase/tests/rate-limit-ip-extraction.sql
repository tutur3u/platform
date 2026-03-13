begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, private, extensions;

select plan(6);

select is(
  host(
    private.get_request_ip(
      jsonb_build_object(
        'cf-connecting-ip', '198.51.100.10',
        'x-forwarded-for', '203.0.113.1, 203.0.113.2',
        'x-real-ip', '203.0.113.3'
      )
    )
  ),
  '198.51.100.10',
  'prefers cf-connecting-ip over forwarded proxy headers'
);

select is(
  host(
    private.get_request_ip(
      jsonb_build_object(
        'CF-Connecting-IP', '198.51.100.11',
        'X-Forwarded-For', '203.0.113.4, 203.0.113.5'
      )
    )
  ),
  '198.51.100.11',
  'accepts uppercase Cloudflare header names'
);

select is(
  host(
    private.get_request_ip(
      jsonb_build_object(
        'true-client-ip', '198.51.100.12',
        'x-forwarded-for', '203.0.113.6, 203.0.113.7'
      )
    )
  ),
  '198.51.100.12',
  'falls back to true-client-ip before generic forwarded headers'
);

select is(
  host(
    private.get_request_ip(
      jsonb_build_object(
        'cf-connecting-ip', 'not-an-ip',
        'x-forwarded-for', '203.0.113.8, 203.0.113.9'
      )
    )
  ),
  '203.0.113.8',
  'falls back to x-forwarded-for when Cloudflare header is invalid'
);

select is(
  host(
    private.get_request_ip(
      jsonb_build_object(
        'x-real-ip', '198.51.100.13'
      )
    )
  ),
  '198.51.100.13',
  'falls back to x-real-ip when no stronger client IP header exists'
);

select is(
  private.get_request_ip(
    jsonb_build_object(
      'cf-connecting-ip', 'still-not-an-ip',
      'true-client-ip', 'also-not-an-ip',
      'x-forwarded-for', 'bad-value',
      'x-real-ip', 'also-bad'
    )
  ),
  null::inet,
  'returns null when no valid client IP header is present'
);

select * from finish();
rollback;
