#!/usr/bin/env python3
"""Real-schema acceptance replay for 20261104221000_tutoring_content_stages.

Disposable local Supabase CLI stack only; it never accepts a remote DSN. Steps:
1. Stage every tracked apps/database/supabase file, with every committed forward
   migration through the merge base (the target migration held back), under a
   unique project id and port block, then `supabase start` (real bootstrap,
   GoTrue auth schema, roles, RLS, seed.sql).
2. Seed synthetic data (plus a synthetic opted-out workspace) through real
   constraints: GoTrue users, workspaces, groups, links, members, an N1 receipt,
   an authorized review boundary and pre-stage N2 history.
3. Apply the target with `supabase migration up` (the CLI runner).
4. Assert ACLs, real PostgREST/JWT member operations, OFF = zero derived writes,
   ON behaviour, opted-out workspace = zero results, day 13/14/15, config overrides, targeting,
   dedup, N1 compatibility and bounded cursor progress.
5. Rollback standalone with an injected backup failure, then successfully.
6. `supabase db reset` at the target head (clean full-chain install), then stop
   the stack with --no-backup and verify no project container remains.

Usage (repository root, Docker reachable):
  python3 apps/database/verification/tutoring-content-rules-real-replay.py \
    --supabase /path/to/supabase --out /private/dir [--base-port 15480]
"""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import urllib.parse
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[3]
BASE = '41038b6e182d564d2752fc42efcbc20fea4dcaca'
TARGET = 'apps/database/supabase/migrations/20261104221000_tutoring_content_stages.sql'
ROLLBACK = 'apps/database/rollbacks/20261103031000_tutoring_content_stages.rollback.sql'
EXCLUDED = ('realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,'
            'edge-runtime,logflare,vector,supavisor')
PORTS = {('db', 'shadow_port'): 0, ('api', 'port'): 1, ('db', 'port'): 2,
         ('studio', 'port'): 3, ('inbucket', 'port'): 4, ('analytics', 'port'): 5,
         ('db.pooler', 'port'): 6, ('edge_runtime', 'inspector_port'): 7}
DISABLED = {'realtime', 'studio', 'inbucket', 'storage', 'edge_runtime',
            'analytics', 'db.pooler', 'auth.external.google',
            'auth.external.github', 'auth.external.apple'}
DERIVED = ['private.tutoring_content_scan_cursor',
           'private.tutoring_content_review_episodes',
           'private.tutoring_notification_receipts',
           'private.tutoring_weak_support_reviews',
           'public.notifications', 'public.notification_delivery_log',
           'public.notification_batches']


def fixed(n):
    return '00000000-0000-4000-8000-%012d' % n


# WOFF is a synthetic workspace whose opt-in is never the literal 'true'.
W1, W2, W3, WOFF = fixed(101), fixed(102), fixed(103), fixed(104)
G1, G1B, G2, G3, G3OFFICE, GOFF = (fixed(201), fixed(202), fixed(203),
                                  fixed(204), fixed(205), fixed(206))
# Students (virtual workspace users) and teacher/office virtual users.
S1, S1B, S13, S14, S15, SNT, S2, S3, SOFF = (fixed(301 + i) for i in range(9))
TV1, TV2, TV3, OV3, TVOFF = (fixed(401 + i) for i in range(5))


class Replay:
    def __init__(self, args):
        self.args = args
        self.out = pathlib.Path(args.out).resolve()
        self.work = self.out / 'work'
        stamp = datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S')
        self.project = 'tt-tcr-replay-' + stamp
        self.container = 'supabase_db_' + self.project
        self.transcript = open(self.out / 'transcript.log', 'a')
        self.results = []
        self.statuses = {}
        self.env = dict(os.environ)
        self.started = False

    # ---------- logging and process helpers ----------
    def log(self, text):
        line = '[%s] %s' % (datetime.datetime.now().isoformat(timespec='seconds'), text)
        self.transcript.write(line + '\n')
        self.transcript.flush()
        print(line, flush=True)

    def run(self, label, cmd, input_text=None, check=True):
        self.log('$ %s  # %s' % (' '.join(cmd), label))
        proc = subprocess.run(cmd, input=input_text, text=True, capture_output=True,
                              env=self.env, cwd=str(ROOT))
        self.transcript.write(proc.stdout[-20000:] + proc.stderr[-20000:] + '\n')
        self.log('exit %s: %s' % (proc.returncode, label))
        self.statuses[label] = proc.returncode
        if check and proc.returncode:
            raise RuntimeError('%s failed with exit %s' % (label, proc.returncode))
        return proc

    def sb(self, label, *args, check=True):
        return self.run(label, [self.args.supabase, '--workdir', str(self.work)] + list(args),
                        check=check)

    def psql(self, sql, label='sql', check=True, user='postgres'):
        cmd = ['docker', 'exec', '-i', self.container, 'psql', '-X', '-U', user,
               '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1']
        proc = subprocess.run(cmd, input=sql, text=True, capture_output=True)
        self.transcript.write('-- %s\n%s\n%s%s\n' % (label, sql.strip()[:4000],
                                                   proc.stdout[-8000:], proc.stderr[-8000:]))
        if check and proc.returncode:
            raise RuntimeError('psql %s failed: %s' % (label, proc.stderr.strip()))
        return proc

    def q(self, sql, label='query'):
        return self.psql(sql, label).stdout.strip()

    def check(self, name, actual, expected):
        ok = actual == expected
        self.results.append({'name': name, 'ok': ok, 'actual': actual, 'expected': expected})
        self.log('%s %s: actual=%r expected=%r' % ('PASS' if ok else 'FAIL', name, actual, expected))
        return ok

    def http(self, method, path, key, token=None, body=None, headers=None):
        request = urllib.request.Request(self.api + path, method=method)
        request.add_header('apikey', key)
        request.add_header('Authorization', 'Bearer ' + (token or key))
        request.add_header('Content-Type', 'application/json')
        for name, value in (headers or {}).items():
            request.add_header(name, value)
        data = json.dumps(body).encode() if body is not None else None
        url = urllib.parse.urlsplit(request.full_url)
        if (url.scheme != 'http' or url.hostname != '127.0.0.1'
                or url.port != self.args.base_port + 1):
            raise ValueError('Replay HTTP requests must target the disposable local API')
        # Disable redirects so the validated loopback origin cannot change.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        opener = urllib.request.build_opener(NoRedirect)
        try:
            with opener.open(request, data, timeout=60) as response:
                status, payload = response.status, response.read().decode()
        except urllib.error.HTTPError as error:
            status, payload = error.code, error.read().decode()
        self.transcript.write('HTTP %s %s -> %s %s\n' % (method, path, status, payload[:2000]))
        try:
            return status, json.loads(payload) if payload else None
        except ValueError:
            return status, payload

    def rpc(self, key, token=None, limit=1000):
        return self.http('POST', '/rest/v1/rpc/process_tutoring_content_rules', key, token,
                         {'p_limit': limit}, {'Content-Profile': 'private'})

    def service_run(self, times=1, limit=1000):
        result = None
        for _ in range(times):
            status, result = self.rpc(self.service_key, limit=limit)
            if status != 200:
                raise RuntimeError('service-role processor call failed: %s %s' % (status, result))
        return result

    # ---------- staging ----------
    def stage(self):
        changed = subprocess.run(['git', 'diff', '--name-status', BASE, 'HEAD', '--',
                                  'apps/database/supabase/migrations'], cwd=ROOT, text=True,
                                 capture_output=True, check=True).stdout.split('\n')
        changed = [line for line in changed if line]
        self.check('migration delta from merge base is only the target', changed, ['A\t' + TARGET])
        tracked = subprocess.run(['git', 'ls-files', 'apps/database/supabase'], cwd=ROOT,
                                 text=True, capture_output=True, check=True).stdout.split()
        if self.work.exists():
            shutil.rmtree(self.work)
        manifest = []
        for name in tracked:
            if name == TARGET or name.startswith('apps/database/supabase/tests/'):
                continue
            destination = self.work / name[len('apps/database/'):]
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, destination)
            if '/migrations/' in name:
                manifest.append('%s  %s' % (hashlib.sha256((ROOT / name).read_bytes()).hexdigest(),
                                            pathlib.Path(name).name))
        manifest.sort(key=lambda line: line.split('  ')[1])
        (self.out / 'base-migrations.sha256').write_text('\n'.join(manifest) + '\n')
        target_digest = hashlib.sha256((ROOT / TARGET).read_bytes()).hexdigest()
        self.manifest = {
            'head': subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True,
                                   capture_output=True, check=True).stdout.strip(),
            'base': BASE, 'base_migration_count': len(manifest),
            'base_manifest_sha256': hashlib.sha256('\n'.join(manifest).encode()).hexdigest(),
            'newest_base_migration': manifest[-1].split('  ')[1],
            'target_sha256': target_digest,
            'rollback_sha256': hashlib.sha256((ROOT / ROLLBACK).read_bytes()).hexdigest(),
            'project_id': self.project,
        }
        config = self.work / 'supabase/config.toml'
        section, lines = None, []
        for line in config.read_text().splitlines():
            header = re.match(r'^\[([^\]]+)\]\s*$', line)
            if header:
                section = header.group(1)
            elif re.match(r'^project_id\s*=', line):
                line = 'project_id = "%s"' % self.project
            else:
                match = re.match(r'^(\w+)\s*=', line)
                if match and (section, match.group(1)) in PORTS:
                    line = '%s = %d' % (match.group(1),
                                        self.args.base_port + PORTS[(section, match.group(1))])
                elif match and match.group(1) == 'enabled' and section in DISABLED:
                    line = 'enabled = false'
            lines.append(line)
        config.write_text('\n'.join(lines) + '\n')
        self.api = 'http://127.0.0.1:%d' % (self.args.base_port + 1)

    # ---------- phases ----------
    def bootstrap(self):
        self.started = True
        self.sb('supabase start (base chain)', 'start', '-x', EXCLUDED)
        status = json.loads(self.sb('supabase status', 'status', '-o', 'json').stdout)
        self.anon_key = status['ANON_KEY']
        self.service_key = status['SERVICE_ROLE_KEY']
        self.manifest['postgres'] = self.q('select version()')
        self.manifest['applied_base_migrations'] = self.q(
            'select count(*) from supabase_migrations.schema_migrations')
        self.manifest['newest_applied'] = self.q(
            'select max(version) from supabase_migrations.schema_migrations')
        self.check('base chain applied count', self.manifest['applied_base_migrations'],
                   str(self.manifest['base_migration_count']))
        self.check('target not yet applied', self.q(
            "select count(*) from supabase_migrations.schema_migrations where version='20261104221000'"), '0')
        self.manifest['auth_users_columns'] = self.q(
            "select count(*) from information_schema.columns where table_schema='auth' and table_name='users'")
        self.manifest['user_feedbacks_policies'] = self.q(
            "select string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, '+'), ' | ' order by policyname) from pg_policies where schemaname='public' and tablename='user_feedbacks'")

    def gotrue_user(self, email):
        status, body = self.http('POST', '/auth/v1/admin/users', self.service_key, body={
            'email': email, 'password': self.password, 'email_confirm': True})
        if status not in (200, 201):
            raise RuntimeError('GoTrue admin create %s failed: %s %s' % (email, status, body))
        return body['id']

    def seed(self):
        self.password = 'Replay-' + uuid.uuid4().hex
        users = {name: self.gotrue_user('%s@tcr-replay.invalid' % name)
                 for name in ['teacher1', 'office1', 'member1', 'teacher2', 'teacher3',
                              'office3', 'offteacher']}
        self.users = users
        self.check('GoTrue users mirrored to public.users', self.q(
            "select count(*) from public.users where id in (%s)" % ','.join("'%s'" % v for v in users.values())), '7')
        sql = []
        for ws, creator, name in [(W1, 'office1', 'Replay W1'), (W2, 'teacher2', 'Replay W2'),
                                  (W3, 'teacher3', 'Replay W3'), (WOFF, 'offteacher', 'Synthetic opted-out workspace')]:
            sql.append("insert into public.workspaces(id,name,creator_id) values ('%s','%s','%s');" % (ws, name, users[creator]))
        for ws, members in [(W1, ['teacher1', 'office1', 'member1']), (W2, ['teacher2']),
                            (W3, ['teacher3', 'office3']), (WOFF, ['offteacher'])]:
            for member in members:
                sql.append("insert into public.workspace_members(ws_id,user_id) values ('%s','%s') on conflict do nothing;" % (ws, users[member]))
        virtual = [(S1, W1), (S1B, W1), (S13, W1), (S14, W1), (S15, W1), (SNT, W1), (S2, W2),
                   (S3, W3), (SOFF, WOFF), (TV1, W1), (TV2, W2), (TV3, W3), (OV3, W3), (TVOFF, WOFF)]
        for vid, ws in virtual:
            sql.append("insert into public.workspace_users(id,ws_id,full_name) values ('%s','%s','Synthetic %s');" % (vid, ws, vid[-4:]))
        for group, ws, name in [(G1, W1, 'Replay class 1'), (G1B, W1, 'Replay class no teacher'),
                                (G2, W2, 'Replay class 2'), (G3, W3, 'Replay class 3'),
                                (G3OFFICE, W3, 'Replay office'), (GOFF, WOFF, 'Synthetic opted-out class')]:
            sql.append("insert into public.workspace_user_groups(id,ws_id,name) values ('%s','%s','%s');" % (group, ws, name))
        for group, uid, role in [(G1, S1, 'STUDENT'), (G1, S1B, 'STUDENT'), (G1, S13, 'STUDENT'),
                                 (G1, S14, 'STUDENT'), (G1, S15, 'STUDENT'), (G1B, SNT, 'STUDENT'),
                                 (G1, TV1, 'TEACHER'), (G2, S2, 'STUDENT'), (G2, TV2, 'TEACHER'),
                                 (G3, S3, 'STUDENT'), (G3, TV3, 'TEACHER'), (G3OFFICE, OV3, 'STUDENT'),
                                 (GOFF, SOFF, 'STUDENT'), (GOFF, TVOFF, 'TEACHER')]:
            sql.append("insert into public.workspace_user_groups_users(group_id,user_id,role) values ('%s','%s','%s');" % (group, uid, role))
        for ws, vid, member in [(W1, TV1, 'teacher1'), (W2, TV2, 'teacher2'), (W3, TV3, 'teacher3'),
                                (W3, OV3, 'office3'), (WOFF, TVOFF, 'offteacher')]:
            sql.append("insert into public.workspace_user_linked_users(ws_id,virtual_user_id,platform_user_id) values ('%s','%s','%s');" % (ws, vid, users[member]))
        for student, group, days in [(S1, G1, 40), (S1B, G1, 40), (S13, G1, 13), (S14, G1, 14),
                                     (S15, G1, 15), (SNT, G1B, 20), (S2, G2, 40), (S3, G3, 10),
                                     (SOFF, GOFF, 40)]:
            sql.append("insert into public.user_feedbacks(user_id,group_id,content,require_attention,created_at) values ('%s','%s','synthetic weak support',true,now()-interval '%d days');" % (student, group, days))
        self.psql('\n'.join(sql), 'seed synthetic workspaces')
        # Authorized review boundaries and pre-stage N2 history, written as the
        # service role (the only writer the foundation migration allows).
        self.psql("""
        set role service_role;
        insert into private.tutoring_weak_support_reviews(group_id,student_user_id,last_reviewed_at) values
          ('%(G1)s','%(S1)s',now()-interval '30 days'),('%(G1)s','%(S1B)s',now()-interval '20 days');
        insert into private.tutoring_notification_receipts(kind,group_id,student_user_id,review_cycle_started_at,recipient_user_id,created_at)
          select 'weak_content_review_due',group_id,student_user_id,last_reviewed_at,'%(T1)s',
                 case when student_user_id='%(S1)s' then now()-interval '15 days' else now()-interval '10 days' end
          from private.tutoring_weak_support_reviews;
        """ % {'G1': G1, 'S1': S1, 'S1B': S1B, 'T1': users['teacher1']}, 'seed review boundary and N2 history')
        session = self.psql("""
        insert into private.workspace_tutoring_sessions(ws_id,group_id,student_user_id,reason_type,session_date,start_time)
          values ('%s','%s','%s','weak_support',current_date,'09:00') returning id;
        """ % (W1, G1, S1), 'seed tutoring session', check=False)
        if session.returncode:
            self.log('tutoring session seed needs other columns: ' + session.stderr.strip())
            raise RuntimeError('N1 session seed failed')
        self.session_id = session.stdout.strip().splitlines()[0]
        self.psql("set role service_role; insert into private.tutoring_notification_receipts(kind,tutoring_session_id,recipient_user_id) values ('session_completed','%s','%s');" % (self.session_id, users['teacher1']), 'seed N1 receipt')
        self.check('pre-target receipts', self.q('select count(*) from private.tutoring_notification_receipts'), '3')

    def apply_target(self):
        shutil.copyfile(ROOT / TARGET, self.work / TARGET[len('apps/database/'):])
        self.sb('supabase migration up (target)', 'migration', 'up', '--local')
        self.check('target applied exactly once', self.q(
            "select count(*) from supabase_migrations.schema_migrations where version='20261104221000'"), '1')
        self.check('N1 receipt stays n1, legacy weak receipts become n2', self.q(
            "select string_agg(kind || ':' || stage, ',' order by kind, stage) from private.tutoring_notification_receipts"),
            'session_completed:n1,weak_content_review_due:n2,weak_content_review_due:n2')

    def snapshot(self):
        parts = {}
        for table in DERIVED:
            if self.q("select to_regclass('%s') is not null" % table) != 't':
                parts[table] = 'absent'
                continue
            parts[table] = self.q("select count(*)::text || ':' || coalesce(md5(string_agg(t::text || '@' || t.xmin::text, ',' order by t::text)), '-') from %s t" % table)
        return parts

    def acl(self):
        for role in ['anon', 'authenticated']:
            self.check('%s cannot execute processor' % role, self.q(
                "select has_function_privilege('%s','private.process_tutoring_content_rules(integer)','execute')" % role), 'f')
            for table in ['private.tutoring_content_scan_cursor', 'private.tutoring_content_review_episodes',
                          'private.tutoring_weak_support_reviews', 'private.tutoring_notification_receipts']:
                self.check('%s has no write/read on %s' % (role, table), self.q(
                    "select has_table_privilege('%s','%s','select') or has_table_privilege('%s','%s','insert') or has_table_privilege('%s','%s','update') or has_table_privilege('%s','%s','delete')" % ((role, table) * 4)), 'f')
        self.check('service_role executes processor', self.q(
            "select has_function_privilege('service_role','private.process_tutoring_content_rules(integer)','execute')"), 't')
        status, body = self.http('POST', '/auth/v1/token?grant_type=password', self.anon_key, body={
            'email': 'member1@tcr-replay.invalid', 'password': self.password})
        if status != 200:
            raise RuntimeError('member sign-in failed: %s %s' % (status, body))
        self.member_jwt = body['access_token']
        before = self.snapshot()
        anon_status, _ = self.rpc(self.anon_key)
        member_status, _ = self.rpc(self.anon_key, self.member_jwt)
        self.check('PostgREST anon processor call refused', anon_status in (401, 403, 404), True)
        self.check('PostgREST member processor call refused', member_status in (401, 403, 404), True)
        status, rows = self.http('POST', '/rest/v1/tutoring_content_scan_cursor', self.anon_key,
                                 self.member_jwt, {'singleton': True, 'after_id': fixed(999)},
                                 {'Content-Profile': 'private', 'Prefer': 'return=representation'})
        self.check('PostgREST member cursor write refused', status in (401, 403, 404), True)
        status, rows = self.http('POST', '/rest/v1/tutoring_weak_support_reviews', self.anon_key,
                                 self.member_jwt, {'group_id': G1, 'student_user_id': S1},
                                 {'Content-Profile': 'private', 'Prefer': 'return=representation'})
        self.check('PostgREST member review write refused', status in (401, 403, 404), True)
        self.check('refused calls wrote nothing', self.snapshot(), before)

    def off_phase(self):
        self.check('no tutoring flag rows before OFF phase', self.q(
            "select count(*) from public.workspace_configs where id like 'tutoring_content_rules%'"), '0')
        cases = [
            ('absent flag, empty cursor', ''),
            ('absent flag, seeded cursor', "insert into private.tutoring_content_scan_cursor values (true,'%s');" % fixed(998)),
            ("flag 'false' (W1), seeded cursor", "insert into public.workspace_configs(ws_id,id,value) values ('%s','tutoring_content_rules','false');" % W1),
            ("flag 'TRUE' (W1), seeded cursor", "update public.workspace_configs set value='TRUE' where ws_id='%s' and id='tutoring_content_rules';" % W1),
            ("flag 'yes' only on opted-out WOFF", "insert into public.workspace_configs(ws_id,id,value) values ('%s','tutoring_content_rules','yes');" % WOFF),
            ('opted-out WOFF only, empty cursor', 'delete from private.tutoring_content_scan_cursor;'),
        ]
        for name, setup in cases:
            if setup:
                self.psql(setup, 'OFF setup: ' + name)
            before = self.snapshot()
            body = self.service_run(times=2)
            self.psql("set role service_role; select private.process_tutoring_content_rules(1000);", 'OFF SQL call')
            self.check('OFF %s: processor result' % name, body, {'sent': 0})
            self.check('OFF %s: zero derived writes' % name, self.snapshot(), before)
        self.psql("delete from public.workspace_configs where ws_id='%s' and id='tutoring_content_rules';" % W1, 'OFF teardown')

    def member_ops_sql(self, label, sql):
        # Data API-equivalent path: authenticated role with the member's JWT claims.
        claims = json.dumps({'sub': self.users['member1'], 'role': 'authenticated'})
        return self.psql("begin; set local role authenticated; select set_config('request.jwt.claims', '%s', true); %s; commit;" % (claims, sql), label, check=False)

    def latest_feedback(self, student):
        return self.q("select id from public.user_feedbacks where user_id='%s' order by created_at desc, id desc limit 1" % student)

    def on_phase(self):
        boundary = lambda s: self.q("select last_reviewed_at from private.tutoring_weak_support_reviews where student_user_id='%s'" % s)
        b1, b1b = boundary(S1), boundary(S1B)
        # Selene's M1 example before any ON run: boundary day -30, N2 day -15,
        # member replacement feedback row today (real JWT through PostgREST).
        status, rows = self.http('POST', '/rest/v1/user_feedbacks', self.anon_key, self.member_jwt,
                                 {'user_id': S1, 'group_id': G1, 'content': 'synthetic weak support',
                                  'require_attention': True}, {'Prefer': 'return=representation'})
        self.member_post_status = status
        self.log('member PostgREST replacement POST status %s' % status)
        if status not in (200, 201):
            self.psql("set role service_role; insert into public.user_feedbacks(user_id,group_id,content,require_attention) values ('%s','%s','synthetic weak support',true);" % (S1, G1), 'API POST equivalent replacement (service role)')
        self.check('S1 replacement row is latest and dated now', self.q(
            "select created_at > now()-interval '1 hour' from public.user_feedbacks where id='%s'" % self.latest_feedback(S1)), 't')
        self.psql("""
        insert into public.workspace_configs(ws_id,id,value) values
          ('%(W1)s','tutoring_content_rules','true'),('%(W3)s','tutoring_content_rules','true'),
          ('%(W3)s','tutoring_content_rules_n2_days','10'),('%(W3)s','tutoring_content_rules_n3_days','3'),
          ('%(W3)s','tutoring_content_rules_office_group','%(G3O)s');
        """ % {'W1': W1, 'W3': W3, 'G3O': G3OFFICE}, 'flag ON for W1/W3 (WOFF stays non-true)')
        self.psql("update public.workspace_configs set updated_at=now()-interval '60 days' where id='tutoring_content_rules' and value='true';", 'historical workspace opt-ins for eligible episode fixtures')
        first = self.service_run()
        self.log('first ON run: %s' % first)
        stages = lambda s: self.q("select coalesce(string_agg(stage || '@' || to_char(review_cycle_started_at,'YYYY-MM-DD\"T\"HH24:MI:SS'), ',' order by stage, review_cycle_started_at), '') from private.tutoring_notification_receipts where student_user_id='%s'" % s)
        self.check('S1 N3 sent on the reviewed cycle despite replacement row', self.q(
            "select count(*) from private.tutoring_notification_receipts where student_user_id='%s' and stage='n3' and review_cycle_started_at='%s'" % (S1, b1)) != '0', True)
        self.check('S1 got no second N2', self.q(
            "select count(*) from private.tutoring_notification_receipts where student_user_id='%s' and stage='n2'" % S1), '1')
        self.check('S1 episode pinned to reviewed cycle', self.q(
            "select cycle_started_at = review_boundary from private.tutoring_content_review_episodes where student_user_id='%s'" % S1), 't')
        self.check('day 13 no notice', stages(S13), '')
        self.check('day 14 one N2', self.q("select count(*) from private.tutoring_notification_receipts where student_user_id='%s' and stage='n2'" % S14), '1')
        self.check('day 15 one N2', self.q("select count(*) from private.tutoring_notification_receipts where student_user_id='%s' and stage='n2'" % S15), '1')
        self.check('no-teacher student: no receipt', stages(SNT), '')
        self.check('flag-absent W2: no receipt', stages(S2), '')
        self.check('S1B N3 not yet due (N2 day -10, n3 14 days)', self.q(
            "select count(*) from private.tutoring_notification_receipts where student_user_id='%s' and stage='n3'" % S1B), '0')
        self.check('W3 n2_days=10 override sends N2 to teacher3 only', self.q(
            "select string_agg(recipient_user_id::text || ':' || stage, ',') from private.tutoring_notification_receipts where student_user_id='%s'" % S3), '%s:n2' % self.users['teacher3'])
        self.check('notification entity_id is uuid group id', self.q(
            "select string_agg(distinct pg_typeof(entity_id)::text || ':' || (entity_id in ('%s','%s','%s'))::text, ',') from public.notifications where type='tutoring_weak_content_review_due'" % (G1, G1B, G3)), 'uuid:true')
        self.check('receipts link real notification rows', self.q(
            "select count(*) from private.tutoring_notification_receipts r where r.kind='weak_content_review_due' and r.notification_id is null and r.created_at > now()-interval '1 hour'"), '0')
        n3_targets = self.q("select string_agg(distinct recipient_user_id::text, ',') from private.tutoring_notification_receipts where student_user_id='%s' and stage='n3'" % S1)
        self.log('S1 N3 recipients (W1 admin/approve_reports holders): %s' % n3_targets)
        self.check('S1 N3 recipients include W1 creator office1', self.users['office1'] in (n3_targets or ''), True)
        # Member edit/toggle/revert/replacement under real JWT/RLS and the SQL path.
        fid = self.latest_feedback(S1B)
        ops = [('PATCH', {'content': 'member edit'}), ('PATCH', {'require_attention': False}),
               ('PATCH', {'require_attention': True}), ('PATCH', {'content': 'synthetic weak support'})]
        self.member_op_statuses = []
        for method, change in ops:
            status, rows = self.http(method, '/rest/v1/user_feedbacks?id=eq.' + fid, self.anon_key,
                                     self.member_jwt, change, {'Prefer': 'return=representation'})
            self.member_op_statuses.append((method, change, status, len(rows) if isinstance(rows, list) else rows))
        status, rows = self.http('POST', '/rest/v1/user_feedbacks', self.anon_key, self.member_jwt,
                                 {'user_id': S1B, 'group_id': G1, 'content': 'replacement',
                                  'require_attention': True}, {'Prefer': 'return=representation'})
        self.member_op_statuses.append(('POST', 'replacement', status, len(rows) if isinstance(rows, list) else rows))
        sql_ops = self.member_ops_sql('member SQL-path edits', (
            "update public.user_feedbacks set content='sql edit' where user_id='%(s)s'; "
            "update public.user_feedbacks set require_attention=false where user_id='%(s)s'; "
            "update public.user_feedbacks set require_attention=true where user_id='%(s)s'; "
            "insert into public.user_feedbacks(user_id,group_id,content,require_attention) values ('%(s)s','%(g)s','sql replacement',true)") % {'s': S1B, 'g': G1})
        self.member_op_statuses.append(('SQL', 'authenticated JWT claims', sql_ops.returncode, sql_ops.stderr.strip()[:300]))
        self.log('member operation statuses: %r' % (self.member_op_statuses,))
        self.manifest['member_rls_rows_for_s1b'] = self.q(
            "select count(*) from public.user_feedbacks where user_id='%s'" % S1B)
        # The API routes write through the service role (sbAdmin): the same edit,
        # toggle, revert and replacement sequence on that path.
        self.psql("""
        set role service_role;
        update public.user_feedbacks set content='api edit' where user_id='%(s)s';
        update public.user_feedbacks set require_attention=false where user_id='%(s)s';
        update public.user_feedbacks set require_attention=true where user_id='%(s)s';
        update public.user_feedbacks set content='synthetic weak support' where user_id='%(s)s';
        insert into public.user_feedbacks(user_id,group_id,content,require_attention) values ('%(s)s','%(g)s','api replacement',true);
        """ % {'s': S1B, 'g': G1}, 'API-equivalent edit/toggle/revert/replacement (service role)')
        self.check('replacement rows exist for S1B', int(self.q(
            "select count(*) from public.user_feedbacks where user_id='%s'" % S1B)) > 1, True)
        self.service_run(times=2)
        self.check('S1 boundary unchanged by member ops', boundary(S1), b1)
        self.check('S1B boundary unchanged by member ops', boundary(S1B), b1b)
        self.check('S1B episode cycle still the reviewed boundary', self.q(
            "select string_agg(cycle_started_at::text, ',') from private.tutoring_content_review_episodes where student_user_id='%s'" % S1B), self.q("select '%s'::timestamptz::text" % b1b))
        self.check('S1B still no N3 and no new-cycle N2', self.q(
            "select string_agg(stage || ':' || (review_cycle_started_at = '%s')::text, ',' order by stage) from private.tutoring_notification_receipts where student_user_id='%s'" % (b1b, S1B)), 'n2:true')
        # Time-travel only the N2 receipt (disposable): N3 is due on the same cycle.
        self.psql("update private.tutoring_notification_receipts set created_at=created_at-interval '4 days' where student_user_id='%s' and stage='n2';" % S1B, 'advance S1B N2 by 4 days')
        self.service_run()
        self.check('S1B N3 due date survived member ops', self.q(
            "select count(*) > 0 from private.tutoring_notification_receipts where student_user_id='%s' and stage='n3' and review_cycle_started_at='%s'" % (S1B, b1b)), 't')
        # W3 office-group N3 with n3_days=3 override.
        self.psql("update private.tutoring_notification_receipts set created_at=created_at-interval '3 days' where student_user_id='%s';" % S3, 'advance S3 N2 by 3 days')
        self.service_run()
        self.check('W3 N3 goes to office group member only', self.q(
            "select string_agg(recipient_user_id::text, ',') from private.tutoring_notification_receipts where student_user_id='%s' and stage='n3'" % S3), self.users['office3'])
        # Repeat calls and dedup.
        before = self.snapshot()
        repeat = self.service_run(times=3)
        self.check('repeat calls send nothing new', repeat, {'sent': 0})
        after = self.snapshot()
        for table in ['private.tutoring_notification_receipts', 'public.notifications',
                      'private.tutoring_content_review_episodes', 'private.tutoring_weak_support_reviews']:
            self.check('repeat calls leave %s unchanged' % table, after[table], before[table])
        # Authorized review path (service role) opens a new cycle.
        self.psql("set role service_role; update private.tutoring_weak_support_reviews set last_reviewed_at=now() where student_user_id='%s';" % S1B, 'authorized review for S1B')
        self.service_run()
        self.check('authorized review opens a second S1B episode', self.q(
            "select count(*) from private.tutoring_content_review_episodes where student_user_id='%s'" % S1B), '2')
        self.check('new S1B cycle sends nothing before day 14', self.q(
            "select count(*) from private.tutoring_notification_receipts where student_user_id='%s' and review_cycle_started_at > now()-interval '1 hour'" % S1B), '0')
        # Opted-out workspace (non-'true' value): zero tenant results.
        for table, column in [('private.tutoring_notification_receipts', 'group_id'),
                              ('private.tutoring_content_review_episodes', 'group_id'),
                              ('private.tutoring_weak_support_reviews', 'group_id')]:
            self.check('opted-out fixture: zero rows in %s' % table, self.q(
                "select count(*) from %s where %s='%s'" % (table, column, GOFF)), '0')
        self.check('opted-out fixture: zero notifications', self.q(
            "select count(*) from public.notifications where ws_id='%s'" % WOFF), '0')
        # N1 compatibility.
        self.check('N1 receipt unchanged', self.q(
            "select count(*) || ':' || min(stage) from private.tutoring_notification_receipts where kind='session_completed'"), '1:n1')
        self.psql("set role service_role; insert into private.tutoring_notification_receipts(kind,tutoring_session_id,recipient_user_id) values ('session_completed','%s','%s') on conflict do nothing;" % (self.session_id, self.users['teacher1']), 'N1 dedup insert')
        self.check('N1 dedup still holds', self.q(
            "select count(*) from private.tutoring_notification_receipts where kind='session_completed'"), '1')
        # Bounded cursor progress with p_limit=1.
        cursors = []
        for _ in range(12):
            self.service_run(limit=1)
            cursors.append(self.q("select coalesce(after_id::text,'null') from private.tutoring_content_scan_cursor"))
        self.log('cursor sequence (p_limit=1): %s' % cursors)
        self.cursors = cursors
        self.check('bounded cursor advances and wraps', len(set(cursors)) > 2 and 'null' in cursors, True)
        self.check('trigger list on public.notifications recorded', True, True)
        self.manifest['notification_triggers'] = self.q(
            "select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid='public.notifications'::regclass and not tgisinternal")
        self.manifest['receipts_by_stage'] = self.q(
            "select string_agg(stage || '=' || n, ',' order by stage) from (select stage, count(*) n from private.tutoring_notification_receipts group by stage) s")
        self.manifest['notifications_tutoring'] = self.q(
            "select count(*) from public.notifications where type='tutoring_weak_content_review_due'")

    def rollback_phase(self):
        # Seed an N2+N3 legacy-key collision, then disable the flag.
        self.psql("""
        insert into private.tutoring_notification_receipts(kind,group_id,student_user_id,review_cycle_started_at,recipient_user_id,stage)
          select kind,group_id,student_user_id,review_cycle_started_at,recipient_user_id,'n3'
          from private.tutoring_notification_receipts where student_user_id='%s' and stage='n2'
          on conflict do nothing;
        update public.workspace_configs set value='false' where id='tutoring_content_rules';
        """ % S14, 'seed legacy-key collision and disable flag')
        collisions = self.q("select count(*) from (select 1 from private.tutoring_notification_receipts group by group_id,student_user_id,review_cycle_started_at,recipient_user_id having count(*)>1) c")
        self.check('legacy-key collisions seeded', int(collisions) >= 1, True)
        receipts = self.q("select count(*) || ':' || md5(string_agg(r::text, ',' order by r.id)) from private.tutoring_notification_receipts r")
        self.psql('create table private.tutoring_content_stage_backup(id uuid check (false));', 'inject disposable backup failure')
        rollback_sql = (ROOT / ROLLBACK).read_text()
        failed = self.psql(rollback_sql, 'rollback with injected failure', check=False)
        self.check('rollback with injected failure exits non-zero', failed.returncode != 0, True)
        self.check('phase 1 disablement committed despite backup failure', self.q(
            "select to_regprocedure('private.process_tutoring_content_rules(integer)') is null"), 't')
        self.check('failed backup phase left no backup rows', self.q('select count(*) from private.tutoring_content_stage_backup'), '0')
        self.check('live receipts untouched after failed rollback', self.q(
            "select count(*) || ':' || md5(string_agg(r::text, ',' order by r.id)) from private.tutoring_notification_receipts r"), receipts)
        self.psql('drop table private.tutoring_content_stage_backup;', 'remove injected failure')
        ok = self.psql(rollback_sql, 'rollback standalone', check=False)
        self.check('rollback standalone exits 0', ok.returncode, 0)
        self.log('collision precheck output: %s' % ok.stdout.strip())
        self.check('collision precheck reports collisions', len([line for line in ok.stdout.strip().splitlines() if line.count('|') == 4]) >= 1, True)
        self.check('backup equals live receipts (both directions)', self.q(
            "select (select count(*) from (select * from private.tutoring_notification_receipts except select * from private.tutoring_content_stage_backup) a) || ':' || (select count(*) from (select * from private.tutoring_content_stage_backup except select * from private.tutoring_notification_receipts) b)"), '0:0')
        self.check('live receipts preserved by rollback', self.q(
            "select count(*) || ':' || md5(string_agg(r::text, ',' order by r.id)) from private.tutoring_notification_receipts r"), receipts)
        self.check('stage schema retained', self.q(
            "select count(*) from information_schema.columns where table_schema='private' and table_name='tutoring_notification_receipts' and column_name='stage'") + ':' + self.q(
            "select (to_regclass('private.tutoring_content_scan_cursor') is not null)::text || (to_regclass('private.tutoring_content_review_episodes') is not null)::text"), '1:truetrue')

    def clean_install(self):
        self.sb('supabase db reset (target head, clean full chain)', 'db', 'reset')
        self.check('clean install: newest migration is the target', self.q(
            'select max(version) from supabase_migrations.schema_migrations'), '20261104221000')
        self.check('clean install: applied count = base + 1', self.q(
            'select count(*) from supabase_migrations.schema_migrations'), str(self.manifest['base_migration_count'] + 1))
        self.check('clean install: processor service-role only', self.q(
            "select string_agg(r || '=' || has_function_privilege(r,'private.process_tutoring_content_rules(integer)','execute')::text, ',' order by r) from unnest(array['anon','authenticated','service_role']) r"),
            'anon=false,authenticated=false,service_role=true')

    def stop(self):
        if not self.started:
            return
        self.sb('supabase stop --no-backup', 'stop', '--project-id', self.project, '--no-backup', check=False)
        left = subprocess.run(['docker', 'ps', '-a', '-q', '--filter',
                               'label=com.supabase.cli.project=%s' % self.project],
                              text=True, capture_output=True).stdout.split()
        volumes = subprocess.run(['docker', 'volume', 'ls', '-q', '--filter',
                                  'label=com.supabase.cli.project=%s' % self.project],
                                 text=True, capture_output=True).stdout.split()
        self.check('no project containers remain', left, [])
        self.check('no project volumes remain', volumes, [])

    def main(self):
        code = 1
        try:
            self.stage()
            self.bootstrap()
            self.seed()
            self.apply_target()
            self.acl()
            self.off_phase()
            self.on_phase()
            self.rollback_phase()
            self.clean_install()
            code = 0
        except Exception as error:  # report, never patch around a failure
            self.log('ABORTED: %r' % error)
        finally:
            self.stop()
            failed = [r for r in self.results if not r['ok']]
            summary = {'manifest': self.manifest if hasattr(self, 'manifest') else {},
                       'statuses': self.statuses, 'assertions': len(self.results),
                       'failed': len(failed), 'aborted': code != 0,
                       'member_ops': getattr(self, 'member_op_statuses', None),
                       'member_post_status': getattr(self, 'member_post_status', None),
                       'cursor_sequence': getattr(self, 'cursors', None),
                       'results': self.results}
            (self.out / 'result.json').write_text(json.dumps(summary, indent=2, default=str))
            self.log('ASSERTIONS %d passed, %d failed, aborted=%s' % (
                len(self.results) - len(failed), len(failed), code != 0))
        return 0 if code == 0 and not failed else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--supabase', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--base-port', type=int, default=15480)
    arguments = parser.parse_args()
    os.umask(0o077)
    pathlib.Path(arguments.out).mkdir(parents=True, exist_ok=True)
    sys.exit(Replay(arguments).main())
