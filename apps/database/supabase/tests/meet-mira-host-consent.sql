begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.cid(n integer) returns uuid language sql immutable as
  $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- Access: service role only, append-only evidence.
select ok((select relrowsecurity from pg_class where oid = 'private.meet_mira_host_acceptances'::regclass), 'acceptances RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'private.meet_mira_participant_choices'::regclass), 'choices RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'private.workspace_mira_consent_defaults'::regclass), 'consent settings RLS enabled');
select ok(not has_table_privilege('anon', 'private.meet_mira_host_acceptances', 'SELECT'), 'anon cannot read acceptances');
select ok(not has_table_privilege('authenticated', 'private.meet_mira_host_acceptances', 'INSERT'), 'authenticated cannot append acceptances');
select ok(not has_table_privilege('authenticated', 'private.meet_mira_participant_choices', 'SELECT'), 'authenticated cannot read choices');
select ok(not has_table_privilege('anon', 'private.meet_mira_participant_choices', 'INSERT'), 'anon cannot append choices');
select ok(not has_table_privilege('authenticated', 'private.workspace_mira_consent_defaults', 'SELECT'), 'authenticated cannot read consent settings');
select ok(not has_table_privilege('service_role', 'private.meet_mira_host_acceptances', 'UPDATE'), 'acceptances have no UPDATE grant');
select ok(not has_table_privilege('service_role', 'private.meet_mira_participant_choices', 'UPDATE'), 'choices have no UPDATE grant');
select ok(has_table_privilege('service_role', 'private.meet_mira_participant_choices', 'INSERT'), 'service appends choices');

insert into auth.users(id) values (pg_temp.cid(9901)), (pg_temp.cid(9902));
insert into public.users(id) values (pg_temp.cid(9901)), (pg_temp.cid(9902)) on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id)
  values (pg_temp.cid(9911), 'Mira consent', false, pg_temp.cid(9901));
insert into public.workspace_meetings(id, ws_id, creator_id, name, time)
  values (pg_temp.cid(9921), pg_temp.cid(9911), pg_temp.cid(9901), 'Mira', now());

set local role service_role;
select is((select revision from private.record_meet_mira_acceptance(pg_temp.cid(9921), pg_temp.cid(9901), 'v1', array['chat'])), 1, 'the first acceptance is revision 1');
select throws_ok($$select * from private.record_meet_mira_acceptance(pg_temp.cid(9921), null, 'v1', array['chat'])$$, '23514', null, 'an acceptance names its acceptor');
select throws_ok($$select * from private.record_meet_mira_acceptance(pg_temp.cid(9921), pg_temp.cid(9901), 'v1', array['voice'])$$, '23514', null, 'unknown capabilities are refused');
select throws_ok($$insert into private.meet_mira_host_acceptances(meeting_id, ws_id, user_id, revision, event, notice_version, audience_adult_confirmed) values (pg_temp.cid(9921), pg_temp.cid(9911), pg_temp.cid(9901), 7, 'accept', 'v1', false)$$, '23514', null, 'an acceptance needs the 18+ confirmation');
select throws_ok($$insert into private.meet_mira_host_acceptances(meeting_id, ws_id, user_id, revision, event, notice_version, audience_adult_confirmed) values (pg_temp.cid(9921), pg_temp.cid(9911), pg_temp.cid(9901), 1, 'accept', 'v1', true)$$, '23505', null, 'a revision is accepted once');
select ok((select created_at > now() - interval '1 minute' from private.meet_mira_host_acceptances where meeting_id = pg_temp.cid(9921) and revision = 1)::boolean, 'server time stamps the acceptance');
-- Choices bind to the acceptance current when they were made.
insert into private.meet_mira_participant_choices(id, meeting_id, ws_id, user_id, choice, source, acceptance_revision, notice_version, text_hash, locale)
  values (pg_temp.cid(9941), pg_temp.cid(9921), pg_temp.cid(9911), pg_temp.cid(9902), 'on', 'join', 1, 'v1', repeat('a', 64), 'vi');
select ok((select acceptance_id is not null and participant_ref <> pg_temp.cid(9902) from private.meet_mira_participant_choices where id = pg_temp.cid(9941)), 'an account choice is bound to its acceptance and pseudonymized');
insert into private.meet_mira_participant_choices(id, meeting_id, ws_id, user_id, choice, source, acceptance_revision, notice_version, text_hash, locale)
  values (pg_temp.cid(9942), pg_temp.cid(9921), pg_temp.cid(9911), pg_temp.cid(9902), 'off', 'toggle', 1, 'v1', repeat('a', 64), 'vi');
select is((select count(distinct participant_ref)::int from private.meet_mira_participant_choices where id in (pg_temp.cid(9941), pg_temp.cid(9942))), 1, 'an account keeps one pseudonym per meeting');
select throws_ok($$insert into private.meet_mira_participant_choices(meeting_id, ws_id, user_id, choice, source, acceptance_revision, notice_version, text_hash, locale) values (pg_temp.cid(9921), pg_temp.cid(9911), pg_temp.cid(9902), 'on', 'confirm', 9, 'v1', repeat('a', 64), 'en')$$, '23503', null, 'a choice cannot name an unknown acceptance revision');
-- Two guests with the same display name are separate server-issued ids.
insert into private.meet_mira_participant_choices(meeting_id, ws_id, guest, participant_ref, choice, source, acceptance_revision, notice_version, text_hash, locale)
  values (pg_temp.cid(9921), pg_temp.cid(9911), true, pg_temp.cid(9951), 'on', 'join', 1, 'v1', repeat('b', 64), 'en'),
         (pg_temp.cid(9921), pg_temp.cid(9911), true, pg_temp.cid(9952), 'off', 'join', 0, 'v1', repeat('b', 64), 'en');
select is((select count(distinct participant_ref)::int from private.meet_mira_participant_choices where guest), 2, 'each guest keeps a separate choice keyed to its guest id');
select ok((select acceptance_id is null from private.meet_mira_participant_choices where participant_ref = pg_temp.cid(9952)), 'a choice without a current acceptance binds to none');
select throws_ok($$insert into private.meet_mira_participant_choices(meeting_id, ws_id, user_id, choice, source, acceptance_revision, notice_version, text_hash, locale) values (pg_temp.cid(9921), pg_temp.cid(9911), pg_temp.cid(9902), 'on', 'join', 1, 'v1', 'not-a-hash', 'en')$$, '23514', null, 'the shown text hash is a SHA-256 hex digest');
select throws_ok($$update private.meet_mira_participant_choices set choice = 'off' where id = pg_temp.cid(9941)$$, '42501', null, 'service role cannot rewrite a choice');
select ok((select private.end_meet_mira_acceptance(pg_temp.cid(9921), 1, null, 'minor_reported')), 'a minor report ends the acceptance');
select ok(not (select private.end_meet_mira_acceptance(pg_temp.cid(9921), 1, pg_temp.cid(9901), 'turned_off')), 'an acceptance ends once');
select is((select revision from private.record_meet_mira_acceptance(pg_temp.cid(9921), pg_temp.cid(9901), 'v1', array['chat', 'notes'])), 2, 'a new acceptance, such as an expansion, takes the next revision');
reset role;
select throws_ok($$update private.meet_mira_participant_choices set choice = 'off' where id = pg_temp.cid(9941)$$, '55000', 'Mira consent evidence is immutable', 'even the owner cannot rewrite a choice');
select throws_ok($$update private.meet_mira_host_acceptances set capabilities = array['chat', 'notes', 'captions'] where meeting_id = pg_temp.cid(9921) and revision = 1 and event = 'accept'$$, '55000', 'Mira consent evidence is immutable', 'an acceptance cannot be widened in place');

-- RESTRICT: evidence blocks meeting deletion.
select throws_ok($$delete from public.workspace_meetings where id = pg_temp.cid(9921)$$, '23503', null, 'evidence blocks meeting deletion');

-- Account deletion anonymizes the account and keeps the evidence.
delete from auth.users where id in (pg_temp.cid(9901), pg_temp.cid(9902));
select ok(not exists (select 1 from private.meet_mira_host_acceptances where meeting_id = pg_temp.cid(9921) and user_id is not null), 'acceptor anonymized on account deletion');
select ok((select user_id is null and choice = 'on' from private.meet_mira_participant_choices where id = pg_temp.cid(9941)), 'chooser anonymized on account deletion, choice kept');

-- Workspace default: an append-only log whose latest row wins.
set local role service_role;
insert into private.workspace_mira_consent_defaults(ws_id, box_ticked, changed_by) values (pg_temp.cid(9911), false, null);
insert into private.workspace_mira_consent_defaults(ws_id, box_ticked, changed_by) values (pg_temp.cid(9911), true, null);
select ok((select box_ticked from private.workspace_mira_consent_defaults where ws_id = pg_temp.cid(9911) order by created_at desc, id desc limit 1), 'the latest default wins');
select throws_ok($$update private.workspace_mira_consent_defaults set box_ticked = false$$, '42501', null, 'the default log is append-only');
reset role;

-- Transcript consent pseudonyms never reuse another guest's by label.
insert into auth.users(id) values (pg_temp.cid(9903));
insert into public.users(id) values (pg_temp.cid(9903)) on conflict do nothing;
insert into public.workspace_meetings(id, ws_id, creator_id, name, time)
  values (pg_temp.cid(9922), pg_temp.cid(9911), pg_temp.cid(9903), 'Guests', now());
insert into public.meet_ai_sessions(id, meeting_id, user_id)
  values (pg_temp.cid(9961), pg_temp.cid(9922), pg_temp.cid(9903));
set local role service_role;
insert into private.meet_ai_consents(id, session_id, participant_ref, guest_label, decision, notice_version)
  values (pg_temp.cid(9971), pg_temp.cid(9961), pg_temp.cid(9981), 'Lan', 'allow', 'v1');
insert into private.meet_ai_consents(id, session_id, participant_ref, guest_label, decision, notice_version)
  values (pg_temp.cid(9972), pg_temp.cid(9961), pg_temp.cid(9982), 'Lan', 'allow', 'v1');
reset role;
select isnt((select participant_ref from private.meet_ai_consents where id = pg_temp.cid(9971)), (select participant_ref from private.meet_ai_consents where id = pg_temp.cid(9972)), 'two guests with the same label get separate pseudonyms');
select ok(not exists (select 1 from private.meet_ai_consents where session_id = pg_temp.cid(9961) and guest_label is not null), 'guest labels are not retained');
set local role service_role;
insert into private.meet_ai_consents(id, session_id, participant_ref, decision, notice_version)
  values (pg_temp.cid(9973), pg_temp.cid(9961), (select participant_ref from private.meet_ai_consents where id = pg_temp.cid(9971)), 'withdraw', 'v1');
reset role;
select is((select participant_ref from private.meet_ai_consents where id = pg_temp.cid(9973)), (select participant_ref from private.meet_ai_consents where id = pg_temp.cid(9971)), 'a guest reuses only its own minted pseudonym');

select * from finish();
rollback;
