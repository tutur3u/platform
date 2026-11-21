begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create type private.accounts_actor_kind as enum ('human', 'system');
alter type private.accounts_actor_kind add value 'machine';

commit;
