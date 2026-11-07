#!/usr/bin/env python3
"""Run search_users against synthetic PostgreSQL fixtures in a disposable cluster."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / 'apps/database/supabase/migrations/20261103040200_fix_search_users_private_nova.sql'
ROLLBACK = ROOT / 'apps/database/rollbacks/20261103040200_fix_search_users_private_nova.rollback.sql'

class SearchUsersTest(unittest.TestCase):
    def test_static_sql_and_acl(self):
        for path in (MIGRATION, ROLLBACK):
            sql = path.read_text()
            self.assertNotIn('return query execute', sql.lower())
            self.assertNotIn('where_clause', sql)
            self.assertIn('return query\n', sql.lower())
            self.assertIn('FROM PUBLIC, anon, authenticated;', sql)
            self.assertIn('TO service_role;', sql)

    def test_definer_guard(self):
        subprocess.run(['node', '-e', "const fs=require('node:fs'); const assert=require('node:assert/strict'); const {lintMigration}=require('./scripts/ci/security-definer-guard'); for(const p of process.argv.slice(1)) assert.deepEqual(lintMigration(fs.readFileSync(p,'utf8')), []);", str(MIGRATION), str(ROLLBACK)], cwd=ROOT, check=True)

    def test_filter_equivalence(self):
        pg_bin = Path(os.environ.get('PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
        with tempfile.TemporaryDirectory(prefix='search-users-fixture-') as tmp:
            env = dict(os.environ, PGHOST=tmp, PGPORT='57662', PGDATABASE='postgres')
            def run(*args):
                return subprocess.run(args, env=env, check=True, capture_output=True, text=True).stdout
            run(str(pg_bin / 'initdb'), '-D', tmp + '/data', '-A', 'trust', '--no-locale')
            run(str(pg_bin / 'pg_ctl'), '-D', tmp + '/data', '-l', tmp + '/server.log', '-o', f'-k {tmp} -p 57662 -h ""', '-w', 'start')
            try:
                def sql(query):
                    result = subprocess.run([str(pg_bin / 'psql'), '-X', '-v', 'ON_ERROR_STOP=1', '-At'], input=query, env=env, capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    return result.stdout
                sql('''create role anon; create role authenticated; create role service_role;
create schema private;
create table public.users(id uuid primary key, display_name text, avatar_url text, handle text, bio text, created_at timestamptz);
create table public.user_private_details(user_id uuid, deleted boolean, email text, new_email text, birthday date, full_name text);
create table public.platform_user_roles(user_id uuid, enabled boolean, allow_challenge_management boolean, allow_manage_all_challenges boolean, allow_role_management boolean);
create table public.nova_team_members(user_id uuid, team_id integer);
create table public.nova_teams(id integer, name text);
create table private.nova_team_members(like public.nova_team_members);
create table private.nova_teams(like public.nova_teams);
insert into public.users select lpad(i::text,32,'0')::uuid, 'User ' || i, null, 'u' || i, null, '2026-01-01'::timestamptz + i * interval '1 minute' from generate_series(1,81) i;
insert into public.user_private_details select id, null, 'fixture' || handle || '@example.invalid', null, null, display_name from public.users;
insert into public.platform_user_roles select id, (array[true,false,null])[(n%3)+1], (array[true,false,null])[((n/3)%3)+1], (array[true,false,null])[((n/9)%3)+1], (array[true,false,null])[((n/27)%3)+1] from (select id, row_number() over(order by id)::int - 1 n from public.users) s;
insert into public.nova_teams values(1,'Alpha'),(2,'Beta'),(3,'Alpha');
insert into public.nova_team_members select id, t from public.users cross join generate_series(1,3) t where handle <> 'u1';
insert into private.nova_teams select * from public.nova_teams;
insert into private.nova_team_members select * from public.nova_team_members;
''')
                reference = subprocess.check_output(['git', 'show', 'c858b69d4cf2792fa9e6d9b0c2f78e31b61d9be3:apps/database/supabase/migrations/20261103040200_fix_search_users_private_nova.sql'], cwd=ROOT, text=True)
                sql(reference.replace('public.search_users(', 'public.search_users_reference('))
                for path in (MIGRATION, ROLLBACK):
                    sql(path.read_text())
                    sql("""do $$ begin
if has_function_privilege('anon','public.search_users(text,integer,integer,text,boolean)','EXECUTE')
or has_function_privilege('authenticated','public.search_users(text,integer,integer,text,boolean)','EXECUTE')
or not has_function_privilege('service_role','public.search_users(text,integer,integer,text,boolean)','EXECUTE') then raise exception 'Unexpected signature ACL'; end if;
end $$;""")
                    count = sql('''do $$
declare r text; e boolean; q text; pg integer; sz integer; expected jsonb; actual jsonb; checks integer := 0;
begin
foreach r in array array[null,'admin','global_manager','challenge_manager','member','unknown'] loop
foreach e in array array[null,true,false] loop
foreach q in array array['','User 1','fixtureu2','absent','%','_',null] loop
foreach pg in array array[1,2] loop
foreach sz in array array[1,7,200] loop
select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into expected from public.search_users_reference(q,pg,sz,r,e) x;
select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into actual from public.search_users(q,pg,sz,r,e) x;
if actual is distinct from expected then raise exception 'Mismatch role %, enabled %, query %, page %, size %', r,e,q,pg,sz; end if;
checks := checks + 1;
end loop; end loop; end loop; end loop; end loop;
raise notice 'Compared % filter/search/pagination combinations', checks;
end $$;
select count(*) from public.search_users('',1,200,null,null);
''')
                    self.assertIn('81', count)
            finally:
                run(str(pg_bin / 'pg_ctl'), '-D', tmp + '/data', '-m', 'fast', '-w', 'stop')

if __name__ == '__main__':
    unittest.main()
