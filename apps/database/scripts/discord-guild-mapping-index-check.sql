-- READ ONLY: post-apply check for 20261027150500_scope_discord_guild_member_access.
-- Run with psql on staging and production after the migration, and send the
-- result to Security and Mastermind. No row means the unique mapping index was
-- skipped for duplicates and the finding stays OPEN until a Mastermind-approved
-- remap or purge, followed by
-- `select public.ensure_discord_guild_member_identity_index();` as the
-- migration role.
begin read only;

select 1
from pg_indexes
where schemaname = 'public'
  and indexname = 'discord_guild_members_guild_discord_user_key';

rollback;
