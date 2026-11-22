begin isolation level repeatable read;

\ir helpers/workspace-manager-isolation.inc

select * from finish();
rollback;
