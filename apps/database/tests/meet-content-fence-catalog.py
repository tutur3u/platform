"""Emit a rollback/reapply catalog rehearsal after the full #7309 replay.

Pipe into disposable PG17 psql -v ON_ERROR_STOP=1. Never use production.
"""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
print("create temp table reservation_before_v4 as select pg_get_functiondef('public.reserve_meet_ai_chunk(uuid,uuid,integer,numeric,numeric)'::regprocedure) as definition;")
print((ROOT / 'apps/database/supabase/migrations/20261103112400_meet_content_fences.sql').read_text())
print((ROOT / 'apps/database/rollbacks/20261103112400_meet_content_fences.rollback.sql').read_text())
print("""do $$begin
 if (select definition from reservation_before_v4) is distinct from
 pg_get_functiondef('public.reserve_meet_ai_chunk(uuid,uuid,integer,numeric,numeric)'::regprocedure) then
   raise exception 'V4 rollback changed the #7309 reservation catalog definition';
 end if;
end$$;
drop table reservation_before_v4;
""")
print((ROOT / 'apps/database/supabase/migrations/20261103112400_meet_content_fences.sql').read_text())
