export const schema = `
CREATE TABLE IF NOT EXISTS channels (
 id TEXT PRIMARY KEY NOT NULL, slug TEXT UNIQUE NOT NULL,
 policy TEXT NOT NULL CHECK(policy IN ('standard','restricted')),
 created_at INTEGER NOT NULL, created_by TEXT NOT NULL,
 CHECK((slug <> 'security' AND slug NOT LIKE 'security/%') OR policy='restricted')
);
CREATE TABLE IF NOT EXISTS schemas (
 name TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0), registered_at INTEGER NOT NULL,
 PRIMARY KEY(name,version)
);
INSERT OR IGNORE INTO schemas VALUES ('security_finding',1,0),('receipt',1,0),('eta_row',1,0),
 ('decision',1,0),('handoff',1,0),('note',1,0);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY NOT NULL, task_id TEXT NOT NULL, channel_id TEXT NOT NULL REFERENCES channels(id),
 author_key TEXT NOT NULL, schema TEXT NOT NULL, schema_version INTEGER NOT NULL,
 body_json TEXT NOT NULL CHECK(json_valid(body_json)), created_at INTEGER NOT NULL,
 FOREIGN KEY(schema,schema_version) REFERENCES schemas(name,version)
);
CREATE INDEX IF NOT EXISTS messages_thread ON messages(channel_id,task_id,created_at,id);
CREATE TABLE IF NOT EXISTS leases (
 task_id TEXT PRIMARY KEY NOT NULL, channel_id TEXT NOT NULL REFERENCES channels(id),
 holder_key TEXT NOT NULL, holder_user_id TEXT NOT NULL, token_hash TEXT NOT NULL, fence INTEGER UNIQUE NOT NULL CHECK(fence>0),
 claimed_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 renewals INTEGER NOT NULL CHECK(renewals BETWEEN 0 AND 5),
 CHECK(expires_at>claimed_at AND expires_at<=claimed_at+1800000)
);
CREATE INDEX IF NOT EXISTS leases_expiry ON leases(expires_at,task_id);
CREATE TABLE IF NOT EXISTS followups (
 id TEXT PRIMARY KEY NOT NULL, task_id TEXT NOT NULL, channel_id TEXT NOT NULL REFERENCES channels(id),
 owner_key TEXT NOT NULL, owner_user_id TEXT NOT NULL, due_at INTEGER NOT NULL, next_at INTEGER,
 kind TEXT NOT NULL CHECK(kind IN ('verify_task','notify')), payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 attempts INTEGER NOT NULL CHECK(attempts BETWEEN 0 AND 3),
 state TEXT NOT NULL CHECK(state IN ('pending','queued','delivering','succeeded','failed','cancelled')),
 generation INTEGER NOT NULL, attempt_deadline INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 terminal_code TEXT, CHECK((next_at IS NOT NULL)=(state='pending')),
 CHECK((attempt_deadline IS NOT NULL)=(state IN ('queued','delivering'))),
 CHECK((terminal_code IS NOT NULL)=(state IN ('succeeded','failed','cancelled')))
);
CREATE INDEX IF NOT EXISTS followups_due ON followups(state,next_at,id);
CREATE INDEX IF NOT EXISTS followups_deadline ON followups(state,attempt_deadline,id);
CREATE INDEX IF NOT EXISTS followups_thread ON followups(channel_id,task_id,id);
CREATE TABLE IF NOT EXISTS watchers (
 id TEXT PRIMARY KEY NOT NULL, owner_key TEXT NOT NULL, owner_user_id TEXT NOT NULL, channel_id TEXT REFERENCES channels(id), label_id TEXT,
 event_mask INTEGER NOT NULL CHECK(event_mask BETWEEN 1 AND 63),
 target_kind TEXT NOT NULL CHECK(target_kind IN ('t3_thread','desk','webhook')), target_ref TEXT NOT NULL,
 created_at INTEGER NOT NULL, disabled_at INTEGER, CHECK(channel_id IS NOT NULL OR label_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS watchers_channel ON watchers(channel_id,disabled_at,id);
CREATE INDEX IF NOT EXISTS watchers_label ON watchers(label_id,disabled_at,id);
CREATE INDEX IF NOT EXISTS watchers_owner ON watchers(owner_key,id);
CREATE TABLE IF NOT EXISTS grants (
 channel_id TEXT NOT NULL REFERENCES channels(id), principal TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('reader','writer','operator')), granted_by TEXT NOT NULL,
 granted_at INTEGER NOT NULL, expires_at INTEGER,
 PRIMARY KEY(channel_id,principal), CHECK(expires_at IS NULL OR expires_at>granted_at)
);
CREATE INDEX IF NOT EXISTS grants_principal ON grants(principal,channel_id);
CREATE INDEX IF NOT EXISTS grants_expiry ON grants(expires_at,channel_id,principal);
CREATE TABLE IF NOT EXISTS delegations (
 agent_key TEXT NOT NULL, user_id TEXT NOT NULL, granted_by TEXT NOT NULL, granted_at INTEGER NOT NULL,
 expires_at INTEGER, PRIMARY KEY(agent_key,user_id), CHECK(expires_at IS NULL OR expires_at>granted_at)
);
CREATE INDEX IF NOT EXISTS delegations_expiry ON delegations(expires_at,agent_key,user_id);
CREATE TABLE IF NOT EXISTS audit (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, authenticated_user_id TEXT,
 action TEXT NOT NULL, channel_id TEXT REFERENCES channels(id), target TEXT NOT NULL, before_json TEXT,
 after_json TEXT, request_id TEXT, CHECK(before_json IS NULL OR json_valid(before_json)),
 CHECK(after_json IS NULL OR json_valid(after_json))
);
CREATE INDEX IF NOT EXISTS audit_channel ON audit(channel_id,seq);
CREATE TABLE IF NOT EXISTS control (
 id INTEGER PRIMARY KEY CHECK(id=1), stopped INTEGER NOT NULL CHECK(stopped IN (0,1)), generation INTEGER NOT NULL,
 next_fence INTEGER NOT NULL, window_start INTEGER NOT NULL, tasks_reads INTEGER NOT NULL, queue_sends INTEGER NOT NULL,
 adapter_calls INTEGER NOT NULL, alarm_sets INTEGER NOT NULL, alarm_at INTEGER
);
INSERT OR IGNORE INTO control VALUES (1,1,0,0,0,0,0,0,0,NULL);
CREATE TABLE IF NOT EXISTS idempotency (
 authenticated_user_id TEXT NOT NULL, actor TEXT NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, status INTEGER NOT NULL,
 response_json TEXT NOT NULL CHECK(json_valid(response_json)), created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 PRIMARY KEY(authenticated_user_id,actor,request_key)
);
CREATE INDEX IF NOT EXISTS idempotency_actor_expiry ON idempotency(actor,expires_at);
CREATE INDEX IF NOT EXISTS idempotency_expiry ON idempotency(expires_at,actor,request_key);
CREATE TABLE IF NOT EXISTS actor_budget (
 actor TEXT NOT NULL, operation TEXT NOT NULL, window_start INTEGER NOT NULL, used INTEGER NOT NULL,
 PRIMARY KEY(actor,operation)
);
CREATE TABLE IF NOT EXISTS watcher_events (
 audit_seq INTEGER PRIMARY KEY REFERENCES audit(seq), channel_id TEXT NOT NULL REFERENCES channels(id),
 task_id TEXT, event_bit INTEGER NOT NULL, generation INTEGER NOT NULL, retry_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS deliveries (
 id TEXT PRIMARY KEY NOT NULL, audit_seq INTEGER NOT NULL REFERENCES audit(seq),
 watcher_id TEXT NOT NULL REFERENCES watchers(id), followup_id TEXT UNIQUE NOT NULL REFERENCES followups(id),
 UNIQUE(audit_seq,watcher_id)
);
`;
