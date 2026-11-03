"""Emit a disposable 2000-line / 20-session P1 timing fixture."""
from pathlib import Path
s=(Path(__file__).resolve().parents[1]/'supabase/tests/meet-transcript-erase.sql').read_text()
print('begin; set local statement_timeout=\'30s\';')
print(s[s.index('insert into auth.users'):s.index('select is(private.count_meet_subject_segments')])
print("""
insert into public.meet_ai_sessions(id,meeting_id,user_id,ended_at,notes)
select md5('v10-session-'||n)::uuid,'00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010',now(),'{"fixture":true}' from generate_series(1,19) n;
insert into public.meet_ai_chunks(id,session_id,sequence,start_seconds,duration_seconds,status,transcript,usage)
select md5('v10-chunk-'||n)::uuid,md5('v10-session-'||(1+(n%19)))::uuid,(n/19),0,8,'completed','fixture',
jsonb_build_object('speaker',jsonb_build_object('accountId','00000000-0000-4000-8000-000000000010')) from generate_series(1,1999) n;
\\timing on
select pg_temp.execute_fixture('00000000-0000-4000-8000-000000000050');
\\timing off
select count(distinct session_id) as sessions, sum(case when usage->>'erased'='true' then 1 else 0 end) as single_lines_erased from public.meet_ai_chunks;
rollback;
""")
