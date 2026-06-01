update private.chat_link_previews
set image_url = null
where image_url is not null;

alter table private.chat_link_previews
drop constraint if exists chat_link_previews_image_url_disabled;

alter table private.chat_link_previews
add constraint chat_link_previews_image_url_disabled
check (image_url is null);

comment on constraint chat_link_previews_image_url_disabled on private.chat_link_previews is
  'Chat link preview images must stay null until the platform serves them through a safe internal image proxy/cache.';
