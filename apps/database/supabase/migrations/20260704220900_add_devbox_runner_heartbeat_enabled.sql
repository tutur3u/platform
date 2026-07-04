alter table private.devbox_runners
add column if not exists heartbeat_enabled boolean not null default false;

comment on column private.devbox_runners.heartbeat_enabled is
  'Controls whether this registered devbox runner may record heartbeat updates.';
