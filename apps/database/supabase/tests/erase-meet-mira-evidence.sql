begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.cid(n integer) returns uuid language sql immutable as
  $$ select ('e5000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

select set_config('request.jwt.claims', '{}', true);
insert into auth.users(id) values
  (pg_temp.cid(1)), (pg_temp.cid(2)), (pg_temp.cid(3)), (pg_temp.cid(4));
insert into public.users(id) values
  (pg_temp.cid(1)), (pg_temp.cid(2)), (pg_temp.cid(3)), (pg_temp.cid(4))
  on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id) values
  (pg_temp.cid(11), 'Erase one', false, pg_temp.cid(1)),
  (pg_temp.cid(12), 'Erase two', false, pg_temp.cid(1)),
  (pg_temp.cid(13), 'Erase three', false, pg_temp.cid(1)),
  (pg_temp.cid(14), 'Erase owned', false, pg_temp.cid(2)),
  (pg_temp.cid(16), 'Erase workspace wrapper', false, pg_temp.cid(1));
-- A Personal workspace for the guard test; the account may already have one.
insert into public.workspaces(id, name, personal, creator_id)
  select pg_temp.cid(15), 'Erase personal', true, pg_temp.cid(3)
  where not exists (
    select 1 from public.workspaces
    where creator_id = pg_temp.cid(3) and personal
  );
create temporary table personal_fixture as
  select id from public.workspaces where creator_id = pg_temp.cid(3) and personal limit 1;

insert into public.workspace_meetings(id, ws_id, creator_id, name, time) values
  (pg_temp.cid(21), pg_temp.cid(11), pg_temp.cid(1), 'Meeting A', now()),
  (pg_temp.cid(22), pg_temp.cid(11), pg_temp.cid(1), 'Meeting B', now()),
  (pg_temp.cid(23), pg_temp.cid(12), pg_temp.cid(1), 'Meeting C', now()),
  (pg_temp.cid(24), pg_temp.cid(13), pg_temp.cid(1), 'Meeting D', now()),
  (pg_temp.cid(25), pg_temp.cid(14), pg_temp.cid(2), 'Meeting E', now()),
  (pg_temp.cid(26), (select id from personal_fixture), pg_temp.cid(3), 'Meeting F', now()),
  (pg_temp.cid(27), pg_temp.cid(16), pg_temp.cid(1), 'Meeting G', now()),
  (pg_temp.cid(28), pg_temp.cid(11), pg_temp.cid(1), 'Meeting H', now());

-- Evidence. Meeting A: one acceptance, four choices (one a guest's) and three
-- per-speaker decisions. B: an untick with no acceptance. C, D, E, F: one choice each.
-- G: an acceptance and two choices. H: only a per-speaker decision.
select private.record_meet_mira_acceptance(pg_temp.cid(21), pg_temp.cid(1), 'v1', array['chat']);
select private.record_meet_mira_acceptance(pg_temp.cid(27), pg_temp.cid(1), 'v1', array['chat']);
insert into private.meet_mira_participant_choices(meeting_id, ws_id, user_id, choice, source, acceptance_revision, notice_version, text_hash, locale) values
  (pg_temp.cid(21), pg_temp.cid(11), pg_temp.cid(2), 'on', 'join', 1, 'v1', repeat('a', 64), 'en'),
  (pg_temp.cid(21), pg_temp.cid(11), pg_temp.cid(1), 'off', 'toggle', 1, 'v1', repeat('b', 64), 'vi'),
  (pg_temp.cid(21), pg_temp.cid(11), pg_temp.cid(4), 'on', 'confirm', 1, 'v1', repeat('a', 64), 'en'),
  (pg_temp.cid(22), pg_temp.cid(11), pg_temp.cid(2), 'off', 'join', 0, 'v1', repeat('a', 64), 'en'),
  (pg_temp.cid(23), pg_temp.cid(12), pg_temp.cid(2), 'off', 'join', 0, 'v1', repeat('a', 64), 'en'),
  (pg_temp.cid(24), pg_temp.cid(13), pg_temp.cid(2), 'off', 'join', 0, 'v1', repeat('a', 64), 'en'),
  (pg_temp.cid(25), pg_temp.cid(14), pg_temp.cid(1), 'off', 'join', 0, 'v1', repeat('a', 64), 'en'),
  (pg_temp.cid(26), (select id from personal_fixture), pg_temp.cid(1), 'off', 'join', 0, 'v1', repeat('a', 64), 'en'),
  (pg_temp.cid(27), pg_temp.cid(16), pg_temp.cid(2), 'on', 'join', 1, 'v1', repeat('a', 64), 'en'),
  (pg_temp.cid(27), pg_temp.cid(16), pg_temp.cid(1), 'off', 'toggle', 1, 'v1', repeat('a', 64), 'en');
insert into private.meet_mira_participant_choices(meeting_id, ws_id, guest, participant_ref, choice, source, acceptance_revision, notice_version, text_hash, locale) values
  (pg_temp.cid(21), pg_temp.cid(11), true, pg_temp.cid(5), 'on', 'join', 1, 'v1', repeat('c', 64), 'en');
insert into public.meet_ai_sessions(id, meeting_id, user_id) values
  (pg_temp.cid(31), pg_temp.cid(21), pg_temp.cid(1)),
  (pg_temp.cid(32), pg_temp.cid(28), pg_temp.cid(1));
insert into private.meet_ai_consents(session_id, user_id, decision, notice_version) values
  (pg_temp.cid(31), pg_temp.cid(2), 'allow', 'v1'),
  (pg_temp.cid(31), pg_temp.cid(2), 'withdraw', 'v1'),
  (pg_temp.cid(31), pg_temp.cid(4), 'deny', 'v1'),
  (pg_temp.cid(32), pg_temp.cid(2), 'allow', 'v1');

-- Access: service role only, and proof rows are written by the routine alone.
select ok(not has_function_privilege('anon', 'private.erase_meet_mira_evidence(uuid,uuid,text)', 'EXECUTE'), 'anon cannot erase evidence');
select ok(not has_function_privilege('authenticated', 'private.erase_meet_mira_evidence(uuid,uuid,text)', 'EXECUTE'), 'authenticated cannot erase evidence');
select ok(has_function_privilege('service_role', 'private.erase_meet_mira_evidence(uuid,uuid,text)', 'EXECUTE'), 'service role can erase evidence');
select ok(not has_function_privilege('authenticated', 'private.delete_meeting_erasing_mira(uuid,uuid)', 'EXECUTE'), 'authenticated cannot use the meeting wrapper');
select ok(not has_function_privilege('anon', 'private.delete_workspace_erasing_mira(uuid,boolean)', 'EXECUTE'), 'anon cannot use the workspace wrapper');
select ok(has_function_privilege('service_role', 'private.delete_workspace_erasing_mira(uuid,boolean)', 'EXECUTE'), 'service role can use the workspace wrapper');
select ok((select relrowsecurity from pg_class where oid = 'private.meet_consent_proofs'::regclass), 'proof rows have RLS enabled');
select ok(not has_table_privilege('anon', 'private.meet_consent_proofs', 'SELECT'), 'anon cannot read proof');
select ok(not has_table_privilege('authenticated', 'private.meet_consent_proofs', 'SELECT'), 'authenticated cannot read proof');
select ok(not has_table_privilege('authenticated', 'private.meet_consent_proofs', 'INSERT'), 'authenticated cannot write proof');
select ok(has_table_privilege('service_role', 'private.meet_consent_proofs', 'SELECT'), 'the service role can read proof');
select ok(not has_table_privilege('service_role', 'private.meet_consent_proofs', 'INSERT'), 'the service role cannot insert proof directly');
select ok(not has_table_privilege('service_role', 'private.meet_consent_proofs', 'UPDATE'), 'the service role cannot rewrite proof');
select ok(not has_table_privilege('service_role', 'private.meet_consent_proofs', 'DELETE'), 'the service role cannot delete proof');
select ok(not has_table_privilege('authenticated', 'private.meet_mira_evidence_erasures', 'SELECT'), 'receipts stay private');
select ok(not has_table_privilege('service_role', 'private.meet_mira_evidence_erasures', 'UPDATE'), 'receipts cannot be rewritten');
select ok((select prosecdef from pg_proc where oid = 'private.erase_meet_mira_evidence(uuid,uuid,text)'::regprocedure), 'the erase routine is a definer function');
select ok((select 'search_path=pg_catalog, pg_temp' = any(proconfig) from pg_proc where oid = 'private.erase_meet_mira_evidence(uuid,uuid,text)'::regprocedure), 'the erase routine pins its search_path');
-- A concurrent Auth account delete cannot run between the copy and commit:
-- the routine key-share locks the accounts its evidence names, in id order,
-- before copying. pgTAP has one session, so the lock is checked structurally;
-- every erase below takes it, which proves the owner may lock auth.users.
select ok(pg_get_functiondef('private.erase_meet_mira_evidence(uuid,uuid,text)'::regprocedure) ~ 'order by u\.id\s+for key share of u', 'the erase routine locks the named accounts in id order');
select ok(
  position('for key share' in pg_get_functiondef('private.erase_meet_mira_evidence(uuid,uuid,text)'::regprocedure))
    < position('insert into private.meet_consent_proofs' in pg_get_functiondef('private.erase_meet_mira_evidence(uuid,uuid,text)'::regprocedure)),
  'and takes the lock before the first copy'
);
select ok(pg_get_functiondef('private.erase_meet_mira_evidence(uuid,uuid,text)'::regprocedure) ~ 'choices_copied <> choices_erased', 'copies and deletions are compared per table');
select has_index('private', 'meet_consent_proofs', 'meet_consent_proofs_unnamed_ref', 'unnamed proof rows are indexed by pseudonym');

-- A proof row holds who, when, notice version, hash, revision and choice, plus
-- the meeting and workspace ids; no transcript, audio, name or email column.
select is(
  (select array_agg(column_name::text order by column_name collate "C")
   from information_schema.columns
   where table_schema = 'private' and table_name = 'meet_consent_proofs'),
  array['capabilities', 'choice', 'decided_at', 'erase_reason', 'erased_at', 'id', 'kind', 'meeting_id', 'notice_version', 'participant_ref', 'purge_after', 'revision', 'room_seq', 'text_hash', 'user_id', 'ws_id'],
  'a proof row holds only the minimal consent columns'
);
select is(
  (select array_agg(column_name::text order by column_name collate "C")
   from information_schema.columns
   where table_schema = 'private' and table_name = 'meet_mira_evidence_erasures'),
  array['acceptances', 'choices', 'consents', 'erased_at', 'id', 'meeting_id', 'reason', 'scope', 'ws_id'],
  'a receipt holds no account, guest or choice data'
);
select ok(not exists (
  select 1 from pg_constraint
  where conrelid = 'private.meet_consent_proofs'::regclass and contype = 'f'
), 'proof rows reference no meeting or workspace, so they never block deleting either');

-- RESTRICT still refuses a bare delete, so a path that does not erase fails closed.
select throws_ok($$delete from public.workspace_meetings where id = pg_temp.cid(21)$$, '23503', null, 'a bare meeting delete is refused while evidence exists');
select throws_ok($$delete from public.workspaces where id = pg_temp.cid(12)$$, '23503', null, 'a bare workspace delete is refused while evidence exists');
select throws_ok($$delete from public.workspace_meetings where id = pg_temp.cid(28)$$, '23503', null, 'a per-speaker consent alone also blocks a bare meeting delete');

-- Scope and reason are validated.
select throws_ok($$select private.erase_meet_mira_evidence(pg_temp.cid(21), pg_temp.cid(11), 'meeting_deleted')$$, '22023', 'Exactly one Mira evidence erase scope is required', 'both scopes are refused');
select throws_ok($$select private.erase_meet_mira_evidence(null, null, 'meeting_deleted')$$, '22023', 'Exactly one Mira evidence erase scope is required', 'no scope is refused');
select throws_ok($$select private.erase_meet_mira_evidence(pg_temp.cid(21), null, 'workspace_deleted')$$, '22023', 'Mira evidence erase reason does not match its scope', 'a reason for the other scope is refused');
select is((select count(*)::int from private.meet_mira_participant_choices where meeting_id = pg_temp.cid(21)), 4, 'a refused erase removes nothing');
select is((select count(*)::int from private.meet_consent_proofs), 0, 'and writes no proof');

-- Erase by meeting: the minimal proof is kept, the originals go.
select is(
  private.erase_meet_mira_evidence(pg_temp.cid(21), null, 'meeting_deleted'),
  '{"acceptances": 1, "choices": 4, "consents": 3}'::jsonb,
  'erasing a meeting reports what it moved'
);
select is((select count(*)::int from private.meet_mira_participant_choices where meeting_id = pg_temp.cid(21)), 0, 'the meeting choices are gone');
select is((select count(*)::int from private.meet_mira_host_acceptances where meeting_id = pg_temp.cid(21)), 0, 'the meeting acceptances are gone');
select is((select count(*)::int from private.meet_ai_consents where session_id = pg_temp.cid(31)), 0, 'the meeting per-speaker decisions are gone');
select is((select count(*)::int from private.meet_ai_consents where session_id = pg_temp.cid(32)), 1, 'another meeting keeps its per-speaker decisions');
select is((select count(*)::int from private.meet_consent_proofs where meeting_id = pg_temp.cid(21)), 8, 'exactly one proof row is kept for each original');
select is(
  (select array_agg(kind || ':' || n order by kind collate "C") from (
    select kind, count(*) as n from private.meet_consent_proofs
    where meeting_id = pg_temp.cid(21) group by kind) k),
  array['mira_acceptance:1', 'mira_choice:4', 'self_v1_decision:3'],
  'one proof of each kind'
);
select ok(exists (
  select 1 from private.meet_consent_proofs
  where meeting_id = pg_temp.cid(21) and kind = 'mira_choice'
    and user_id = pg_temp.cid(2) and choice = 'on' and revision = 1
    and notice_version = 'v1' and text_hash = repeat('a', 64)
    and ws_id = pg_temp.cid(11) and erase_reason = 'meeting_deleted'
), 'a choice proof keeps who, the choice, the revision, the notice version and the hash');
select ok(exists (
  select 1 from private.meet_consent_proofs
  where meeting_id = pg_temp.cid(21) and kind = 'mira_acceptance'
    and user_id = pg_temp.cid(1) and choice = 'accept' and revision = 1
    and capabilities = array['chat'] and text_hash is null
), 'an acceptance proof keeps who accepted and what it covered');
select is(
  (select array_agg(choice || ':' || revision order by revision) from private.meet_consent_proofs
   where meeting_id = pg_temp.cid(21) and kind = 'self_v1_decision' and user_id = pg_temp.cid(2)),
  array['allow:1', 'withdraw:2'],
  'per-speaker decisions keep their order as revisions'
);
select ok(not exists (
  select 1 from private.meet_consent_proofs
  where meeting_id = pg_temp.cid(21) and purge_after is distinct from erased_at + interval '3 years'
), 'every proof is kept for three years after the erase');
select is(
  (select acceptances || ':' || choices || ':' || consents || ':' || reason from private.meet_mira_evidence_erasures where meeting_id = pg_temp.cid(21)),
  '1:4:3:meeting_deleted',
  'the meeting erase left one receipt with the counts'
);
select is(
  private.erase_meet_mira_evidence(pg_temp.cid(21), null, 'meeting_deleted'),
  '{"acceptances": 0, "choices": 0, "consents": 0}'::jsonb,
  'erasing again moves nothing'
);
select is((select count(*)::int from private.meet_consent_proofs where meeting_id = pg_temp.cid(21)), 8, 'and adds no proof');
select is((select count(*)::int from private.meet_mira_evidence_erasures where meeting_id = pg_temp.cid(21)), 1, 'an empty erase leaves no receipt');
select lives_ok($$delete from public.workspace_meetings where id = pg_temp.cid(21)$$, 'the meeting then deletes');

-- Proof is append-only, and kept until its purge date.
select throws_ok($$update private.meet_consent_proofs set choice = 'off' where meeting_id = pg_temp.cid(21) and kind = 'mira_choice'$$, '55000', 'Mira consent evidence is immutable', 'even the owner cannot rewrite proof');
select throws_ok($$update private.meet_consent_proofs set purge_after = now() where meeting_id = pg_temp.cid(21)$$, '55000', 'Mira consent evidence is immutable', 'or shorten its retention');
select throws_ok($$delete from private.meet_consent_proofs where meeting_id = pg_temp.cid(21)$$, '55000', 'Consent proof is kept until its purge date', 'proof cannot be deleted before its purge date');
insert into private.meet_consent_proofs(kind, choice, notice_version, decided_at, erase_reason, purge_after)
  values ('mira_choice', 'on', 'v1', now(), 'meeting_deleted', now() - interval '1 day');
select lives_ok($$delete from private.meet_consent_proofs where purge_after <= now()$$, 'proof past its purge date can be removed');
select is((select count(*)::int from private.meet_consent_proofs where meeting_id = pg_temp.cid(21)), 8, 'and only that proof');

-- Deleting an account clears the account id and its pseudonym from that
-- account's proof, keeps everything else, and leaves a guest's id alone.
select is((select count(*)::int from private.meet_consent_proofs where user_id = pg_temp.cid(4)), 2, 'proof names the account before it is deleted');
select is((select count(*)::int from private.meet_consent_proofs where user_id = pg_temp.cid(4) and participant_ref is not null), 2, 'with a pseudonym that links its rows');
select lives_ok($$delete from auth.users where id = pg_temp.cid(4)$$, 'an account with proof deletes');
select is((select count(*)::int from private.meet_consent_proofs where user_id = pg_temp.cid(4)), 0, 'no proof names the deleted account');
select is((select count(*)::int from private.meet_consent_proofs where meeting_id = pg_temp.cid(21) and user_id is null and participant_ref is null), 2, 'its two proof rows keep neither the account id nor the pseudonym');
select ok(exists (
  select 1 from private.meet_consent_proofs
  where meeting_id = pg_temp.cid(21) and user_id is null and participant_ref is null
    and kind = 'mira_choice' and choice = 'on' and revision = 1
    and text_hash = repeat('a', 64) and notice_version = 'v1'
    and ws_id = pg_temp.cid(11) and erase_reason = 'meeting_deleted'
), 'an anonymized choice proof keeps the choice, revision, hash, notice version and ids');
select ok(exists (
  select 1 from private.meet_consent_proofs
  where meeting_id = pg_temp.cid(21) and user_id is null and participant_ref is null
    and kind = 'self_v1_decision' and choice = 'deny' and notice_version = 'v1'
), 'an anonymized per-speaker proof keeps the decision and notice version');
select is((select count(*)::int from private.meet_consent_proofs where meeting_id = pg_temp.cid(21) and participant_ref = pg_temp.cid(5) and user_id is null), 1, 'a guest keeps its guest id');
select ok((select count(*) from private.meet_consent_proofs where user_id = pg_temp.cid(1) and participant_ref is not null) > 0, 'another account keeps its proof untouched');
select throws_ok($$update private.meet_consent_proofs set participant_ref = null where meeting_id = pg_temp.cid(21) and participant_ref = pg_temp.cid(5)$$, '55000', 'Mira consent evidence is immutable', 'a guest id cannot be cleared outside account deletion');

-- Account deletion also clears a pseudonym that links to the account when the
-- row does not name it, and evidence erased after the deletion keeps neither.
insert into auth.users(id) values (pg_temp.cid(6));
insert into public.users(id) values (pg_temp.cid(6)) on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id) values
  (pg_temp.cid(17), 'Erase pseudonym', false, pg_temp.cid(1));
insert into public.workspace_meetings(id, ws_id, creator_id, name, time) values
  (pg_temp.cid(41), pg_temp.cid(17), pg_temp.cid(1), 'Meeting P', now()),
  (pg_temp.cid(42), pg_temp.cid(17), pg_temp.cid(1), 'Meeting Q', now());
insert into private.meet_mira_participant_choices(meeting_id, ws_id, user_id, choice, source, acceptance_revision, notice_version, text_hash, locale) values
  (pg_temp.cid(41), pg_temp.cid(17), pg_temp.cid(6), 'off', 'join', 0, 'v1', repeat('a', 64), 'en'),
  (pg_temp.cid(42), pg_temp.cid(17), pg_temp.cid(6), 'off', 'join', 0, 'v1', repeat('a', 64), 'en'),
  (pg_temp.cid(42), pg_temp.cid(17), pg_temp.cid(6), 'on', 'toggle', 0, 'v1', repeat('a', 64), 'en');
insert into private.meet_mira_participant_choices(meeting_id, ws_id, guest, participant_ref, choice, source, acceptance_revision, notice_version, text_hash, locale) values
  (pg_temp.cid(42), pg_temp.cid(17), true, pg_temp.cid(7), 'off', 'join', 0, 'v1', repeat('c', 64), 'en');
insert into public.meet_ai_sessions(id, meeting_id, user_id) values
  (pg_temp.cid(33), pg_temp.cid(42), pg_temp.cid(1));
insert into private.meet_ai_consents(session_id, user_id, decision, notice_version) values
  (pg_temp.cid(33), pg_temp.cid(6), 'allow', 'v1');
create temporary table account_refs as
  select participant_ref as ref from private.meet_mira_participant_choices
    where user_id = pg_temp.cid(6)
  union
  select participant_ref from private.meet_ai_consents where user_id = pg_temp.cid(6);
select is((select count(*)::int from account_refs), 3, 'the account has a pseudonym per meeting and per session');
select is((private.erase_meet_mira_evidence(pg_temp.cid(41), null, 'meeting_deleted')->>'choices')::int, 1, 'one meeting is erased while the account exists');
-- A proof row that carries the account's live pseudonym without its id.
insert into private.meet_consent_proofs(kind, meeting_id, ws_id, participant_ref, choice, revision, notice_version, decided_at, erase_reason)
  select 'mira_choice', pg_temp.cid(42), pg_temp.cid(17), c.participant_ref, 'off', 0, 'v1', now(), 'meeting_deleted'
  from private.meet_mira_participant_choices c
  where c.meeting_id = pg_temp.cid(42) and c.user_id = pg_temp.cid(6) limit 1;
select throws_ok($$update private.meet_consent_proofs set participant_ref = null where meeting_id = pg_temp.cid(42)$$, '55000', 'Mira consent evidence is immutable', 'a linked pseudonym cannot be cleared outside account deletion');
select set_config('private.meet_consent_erased_account', pg_temp.cid(2)::text, true);
select throws_ok($$update private.meet_consent_proofs set participant_ref = null where meeting_id = pg_temp.cid(42)$$, '55000', 'Mira consent evidence is immutable', 'naming a live account does not unlock proof rows');
select set_config('private.meet_consent_erased_account', '', true);
select lives_ok($$delete from auth.users where id = pg_temp.cid(6)$$, 'the account deletes');
select is(current_setting('private.meet_consent_erased_account', true), '', 'the deletion marker does not outlive the trigger');
select is((select count(*)::int from private.meet_consent_proofs where participant_ref in (select ref from account_refs)), 0, 'no proof row keeps a pseudonym of the deleted account');
select is((select count(*)::int from private.meet_consent_proofs where meeting_id in (pg_temp.cid(41), pg_temp.cid(42)) and user_id is null and participant_ref is null), 2, 'the proof erased before and the unnamed linked row are both cleared');
select is((select count(*)::int from private.meet_mira_participant_choices where meeting_id = pg_temp.cid(42) and not guest and user_id is not null), 0, 'live choices no longer name the account');
select is(
  private.erase_meet_mira_evidence(pg_temp.cid(42), null, 'meeting_deleted'),
  '{"acceptances": 0, "choices": 3, "consents": 1}'::jsonb,
  'evidence erased after the deletion is still moved'
);
select is((select count(*)::int from private.meet_consent_proofs where user_id = pg_temp.cid(6)), 0, 'and its proof does not name the account');
select is((select count(*)::int from private.meet_consent_proofs where kind = 'mira_choice' and participant_ref in (select ref from account_refs)), 0, 'its Mira choice proof keeps no pseudonym');
-- A per-speaker decision's pseudonym is per session, and the account id was
-- cleared from every row carrying it, so it no longer links to the account.
select is((select count(*)::int from private.meet_consent_proofs where meeting_id = pg_temp.cid(42) and kind = 'self_v1_decision' and user_id is null and choice = 'allow'), 1, 'a per-speaker decision of the deleted account keeps the decision without the account id');
select is((select count(*)::int from private.meet_consent_proofs where participant_ref in (select ref from account_refs) and user_id is not null), 0, 'no proof row ties a pseudonym of the deleted account to any account');
select is((select count(*)::int from private.meet_ai_consents where participant_ref in (select ref from account_refs) and user_id is not null), 0, 'nor does any live per-speaker decision');
select is((select tgname::text from pg_trigger where tgrelid = 'auth.users'::regclass and tgname in ('anonymize_linked_meet_evidence', 'anonymize_meet_ai_consents') order by tgname collate "C" limit 1), 'anonymize_linked_meet_evidence', 'the pseudonym collector fires before per-speaker decisions lose their account id');
select is((select count(*)::int from private.meet_consent_proofs where meeting_id = pg_temp.cid(42) and participant_ref = pg_temp.cid(7)), 1, 'a guest in the same meeting keeps its guest id');
select ok((select count(*) from private.meet_consent_proofs where user_id = pg_temp.cid(1) and participant_ref is not null) > 0, 'another account keeps its pseudonyms');

-- Erase by workspace.
select is(
  private.erase_meet_mira_evidence(null, pg_temp.cid(12), 'workspace_deleted'),
  '{"acceptances": 0, "choices": 1, "consents": 0}'::jsonb,
  'erasing a workspace reports what it moved'
);
select is((select count(*)::int from private.meet_consent_proofs where ws_id = pg_temp.cid(12) and erase_reason = 'workspace_deleted'), 1, 'its proof is kept');
select is(
  (select choices || ':' || reason from private.meet_mira_evidence_erasures where ws_id = pg_temp.cid(12)),
  '1:workspace_deleted',
  'the workspace erase left one receipt'
);
select is((select count(*)::int from private.meet_mira_participant_choices where ws_id = pg_temp.cid(13)), 1, 'another workspace keeps its evidence');

-- A choice with no acceptance (an untick before any acceptance) blocks the
-- delete too, and the erase moves it.
select throws_ok($$delete from public.workspace_meetings where id = pg_temp.cid(22)$$, '23503', null, 'an untick with no acceptance also blocks the delete');
select is((private.erase_meet_mira_evidence(pg_temp.cid(22), null, 'meeting_deleted')->>'choices')::int, 1, 'the untick is erased');
select is((select count(*)::int from private.meet_consent_proofs where meeting_id = pg_temp.cid(22) and choice = 'off' and revision = 0), 1, 'and kept as proof');
select lives_ok($$delete from public.workspace_meetings where id = pg_temp.cid(22)$$, 'the meeting then deletes');

-- Meeting wrapper: copy, erase and delete in one transaction.
select is(private.delete_meeting_erasing_mira(pg_temp.cid(11), pg_temp.cid(24)), 'not_deleted', 'the wrapper refuses a meeting of another workspace');
select is((select count(*)::int from private.meet_mira_participant_choices where meeting_id = pg_temp.cid(24)), 1, 'a refused wrapper call keeps the evidence');
select is(private.delete_meeting_erasing_mira(pg_temp.cid(13), pg_temp.cid(24)), 'deleted', 'the wrapper deletes a meeting that holds evidence');
select is((select count(*)::int from private.meet_mira_participant_choices where meeting_id = pg_temp.cid(24)), 0, 'the wrapper moved the evidence');
select is((select count(*)::int from private.meet_consent_proofs where meeting_id = pg_temp.cid(24)), 1, 'and kept its proof');
select is(private.delete_meeting_erasing_mira(pg_temp.cid(13), pg_temp.cid(24)), 'not_deleted', 'a repeat finds nothing to delete');
select is(private.delete_meeting_erasing_mira(pg_temp.cid(11), pg_temp.cid(28)), 'deleted', 'the wrapper deletes a meeting held only by a per-speaker consent');
select is((select count(*)::int from private.meet_consent_proofs where meeting_id = pg_temp.cid(28) and kind = 'self_v1_decision'), 1, 'and keeps that decision as proof');

-- A delete that fails after the copy rolls the copy and the erase back.
create table public.erase_mira_blocker (
  meeting_id uuid references public.workspace_meetings(id) on delete restrict
);
insert into private.meet_mira_participant_choices(meeting_id, ws_id, user_id, choice, source, acceptance_revision, notice_version, text_hash, locale) values
  (pg_temp.cid(23), pg_temp.cid(12), pg_temp.cid(2), 'off', 'join', 0, 'v1', repeat('a', 64), 'en');
insert into public.erase_mira_blocker(meeting_id) values (pg_temp.cid(23));
select throws_ok($$select private.delete_meeting_erasing_mira(pg_temp.cid(12), pg_temp.cid(23))$$, '23503', null, 'a meeting blocked for another reason is not deleted');
select is((select count(*)::int from private.meet_mira_participant_choices where meeting_id = pg_temp.cid(23)), 1, 'its evidence is kept when the delete fails');
select is((select count(*)::int from private.meet_consent_proofs where meeting_id = pg_temp.cid(23)), 1, 'no proof is written for it beyond the one its workspace erase kept');
select is((select count(*)::int from private.meet_mira_evidence_erasures where meeting_id = pg_temp.cid(23)), 0, 'and no receipt');
delete from public.erase_mira_blocker;

-- Workspace wrapper, including the Personal workspace guard.
select is(private.delete_workspace_erasing_mira((select id from personal_fixture), true), 'not_deleted', 'the guard refuses a Personal workspace');
select is((select count(*)::int from private.meet_mira_participant_choices where meeting_id = pg_temp.cid(26)), 1, 'a refused Personal delete keeps its evidence');
select throws_ok($$delete from public.workspaces where id = pg_temp.cid(16)$$, '23503', null, 'a bare delete of a workspace with acceptances and choices is refused');
select is(private.delete_workspace_erasing_mira(pg_temp.cid(16), true), 'deleted', 'the wrapper deletes a workspace that holds acceptances and choices');
select is((select count(*)::int from public.workspaces where id = pg_temp.cid(16)), 0, 'the workspace is gone');
select is((select count(*)::int from private.meet_mira_participant_choices where ws_id = pg_temp.cid(16)), 0, 'its choices were moved');
select is((select count(*)::int from private.meet_mira_host_acceptances where ws_id = pg_temp.cid(16)), 0, 'its acceptances were moved');
select is((select count(*)::int from private.meet_consent_proofs where ws_id = pg_temp.cid(16)), 3, 'its three proof rows are kept');
select ok(not exists (
  select 1 from private.meet_consent_proofs
  where ws_id = pg_temp.cid(16) and purge_after < now() + interval '2 years 11 months'
), 'kept for about three years');
select is((select acceptances || ':' || choices || ':' || consents || ':' || reason from private.meet_mira_evidence_erasures where ws_id = pg_temp.cid(16)), '1:2:0:workspace_deleted', 'a receipt records the counts');
select is(private.delete_workspace_erasing_mira(pg_temp.cid(16), true), 'not_deleted', 'a repeat finds nothing to delete');

-- Attendance-aware deletes erase as well.
select private.record_meet_mira_acceptance(pg_temp.cid(23), pg_temp.cid(1), 'v1', array['chat']);
select is(private.delete_meeting_with_attendance_intent(pg_temp.cid(12), pg_temp.cid(23), '{}'::jsonb), 'deleted', 'the attendance-aware meeting delete removes a meeting with evidence');
select is((select count(*)::int from private.meet_mira_host_acceptances where meeting_id = pg_temp.cid(23)), 0, 'and moves its acceptance');
select is((select count(*)::int from private.meet_consent_proofs where meeting_id = pg_temp.cid(23) and kind = 'mira_acceptance'), 1, 'into proof');
select is(private.delete_workspace_with_attendance_intent(pg_temp.cid(12), '{}'::jsonb), 'deleted', 'the attendance-aware workspace delete removes a workspace');

-- Owner-only deletion erases too, and keeps its own receipt.
select private.record_meet_mira_acceptance(pg_temp.cid(25), pg_temp.cid(2), 'v1', array['chat']);
select is(public.delete_owned_workspace(pg_temp.cid(14), pg_temp.cid(2), 'Erase owned'), 'deleted', 'owner deletion removes a workspace that holds evidence');
select is((select count(*)::int from private.meet_mira_host_acceptances where ws_id = pg_temp.cid(14)), 0, 'and its acceptance');
select is((select count(*)::int from private.meet_mira_participant_choices where ws_id = pg_temp.cid(14)), 0, 'and its choices');
select is((select count(*)::int from private.meet_consent_proofs where ws_id = pg_temp.cid(14)), 2, 'leaving its two proof rows');
select is((select count(*)::int from private.workspace_deletion_audit where ws_id = pg_temp.cid(14)), 1, 'the owner deletion receipt is still written');
select is((select acceptances || ':' || choices || ':' || consents from private.meet_mira_evidence_erasures where ws_id = pg_temp.cid(14)), '1:1:0', 'the erase receipt counts what it moved');

-- Replacing the functions kept their settings.
select ok(coalesce((select 'statement_timeout=60s' = any(proconfig) from pg_proc where oid = 'public.delete_owned_workspace(uuid, uuid, text)'::regprocedure), false), 'owner deletion keeps its 60-second statement timeout');
select ok(coalesce((select 'statement_timeout=60s' = any(proconfig) from pg_proc where oid = 'private.delete_workspace_with_attendance_intent(uuid, jsonb)'::regprocedure), false), 'attendance-aware workspace deletion keeps its 60-second statement timeout');
select ok(coalesce((select 'statement_timeout=60s' = any(proconfig) from pg_proc where oid = 'private.delete_workspace_erasing_mira(uuid, boolean)'::regprocedure), false), 'the workspace wrapper has the same 60-second statement timeout');
select ok(coalesce((select 'search_path=pg_catalog, pg_temp' = any(proconfig) from pg_proc where oid = 'public.delete_owned_workspace(uuid, uuid, text)'::regprocedure), false), 'owner deletion keeps its pinned search_path');
select ok(not has_function_privilege('authenticated', 'public.delete_owned_workspace(uuid,uuid,text)', 'EXECUTE'), 'owner deletion is still closed to authenticated sessions');
select ok(has_function_privilege('service_role', 'private.delete_meeting_with_attendance_intent(uuid,uuid,jsonb)', 'EXECUTE'), 'the attendance-aware meeting delete is still open to the service role');
select ok(not has_function_privilege('authenticated', 'private.anonymize_linked_meet_evidence()', 'EXECUTE'), 'the proof anonymization trigger function stays closed to clients');
select ok(not has_function_privilege('anon', 'private.anonymize_linked_meet_evidence()', 'EXECUTE'), 'and closed to anon');

select * from finish();
rollback;
