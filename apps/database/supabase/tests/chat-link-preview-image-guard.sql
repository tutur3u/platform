begin;

select plan(3);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'private.chat_link_previews'::regclass
      and conname = 'chat_link_previews_image_url_disabled'
  ),
  'chat link preview cache disables direct image URLs'
);

select throws_ok(
  $$
    insert into private.chat_link_previews (
      normalized_url,
      url,
      image_url
    )
    values (
      'https://example.com/with-image',
      'https://example.com/with-image',
      'https://tracker.example/pixel.png'
    )
  $$,
  '23514',
  null,
  'chat link preview cache rejects remote image URLs'
);

select lives_ok(
  $$
    insert into private.chat_link_previews (
      normalized_url,
      url,
      image_url
    )
    values (
      'https://example.com/text-only',
      'https://example.com/text-only',
      null
    )
  $$,
  'chat link preview cache accepts text-only previews'
);

select * from finish();

rollback;
