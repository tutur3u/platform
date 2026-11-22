begin isolation level serializable;

\ir helpers/workspace-manager-isolation.inc

select * from finish();
rollback;
