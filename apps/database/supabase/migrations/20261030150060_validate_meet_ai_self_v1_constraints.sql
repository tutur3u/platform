-- Validate the NOT VALID self_v1 constraints from 20261030150000 in their own
-- transaction, so the earlier ALTER TABLE locks are not held during scans.
-- Existing rows are legacy with all-NULL self_v1 columns, so every check holds.
set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.meet_ai_sessions validate constraint meet_ai_sessions_user_id_fkey;
alter table public.meet_ai_sessions validate constraint meet_ai_sessions_billing_ws_id_fkey;
alter table public.meet_ai_sessions validate constraint meet_ai_sessions_billing_host_id_fkey;
alter table public.meet_ai_sessions validate constraint meet_ai_sessions_protocol_check;
alter table public.meet_ai_sessions validate constraint meet_ai_sessions_capture_state_check;
alter table public.meet_ai_sessions validate constraint meet_ai_sessions_counters_check;
alter table public.meet_ai_sessions validate constraint meet_ai_sessions_cost_check;
alter table public.meet_ai_sessions validate constraint meet_ai_sessions_legacy_check;
alter table public.meet_ai_sessions validate constraint meet_ai_sessions_self_v1_check;
alter table public.meet_ai_chunks validate constraint meet_ai_chunks_account_id_fkey;
alter table public.meet_ai_chunks validate constraint meet_ai_chunks_stream_fkey;
alter table public.meet_ai_chunks validate constraint meet_ai_chunks_provenance_check;
