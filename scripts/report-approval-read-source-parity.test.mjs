import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const rust = 'apps/backend/src/';

test('Rust periodic approval count and data share both workspace predicates', () => {
  const file = source(`${rust}workspaces_wsid_users_approvals.rs`);
  const body = file.slice(
    file.indexOf('async fn fetch_reports('),
    file.indexOf('async fn fetch_posts(')
  );
  const base = body.slice(0, body.indexOf('// Count.'));
  assert.match(base, /\("user_ws_id", format!\("eq\.\{ws_id\}"\)\)/);
  assert.match(base, /\("group_ws_id", format!\("eq\.\{ws_id\}"\)\)/);
  assert.match(body, /let mut count_params = base\.clone\(\)/);
  assert.match(body, /let mut data_params = base/);
});

test('Rust pending report count and approved log query retain both workspace predicates', () => {
  const summary = source(
    `${rust}workspaces_settings_approvals_pending_summary.rs`
  );
  const count = summary.slice(
    summary.indexOf('async fn pending_reports_count('),
    summary.indexOf('async fn pending_posts_count(')
  );
  assert.match(count, /\("user_ws_id", format!\("eq\.\{ws_id\}"\)\)/);
  assert.match(count, /\("group_ws_id", format!\("eq\.\{ws_id\}"\)\)/);
  const logs = source(`${rust}workspaces_users_approvals_logs.rs`);
  const periodic = logs.slice(
    logs.indexOf('let params = vec!['),
    logs.indexOf('"external_user_monthly_report_logs_workspace_view"')
  );
  assert.match(
    periodic,
    /\("user_ws_id", format!\("eq\.\{resolved_ws_id\}"\)\)/
  );
  assert.match(
    periodic,
    /\("group_ws_id", format!\("eq\.\{resolved_ws_id\}"\)\)/
  );
});

test('first-class Web reads retain request-time GET and bodyless HEAD adapters', () => {
  for (const path of [
    'settings/approvals/pending-summary',
    'users/approvals/logs',
  ]) {
    const file = source(
      `apps/web/src/app/api/v1/workspaces/[wsId]/${path}/route.ts`
    );
    assert.match(file, /createLegacyGetHandler\(implementationGet\)/);
    assert.match(file, /createLegacyHeadHandler\(GET\)/);
    assert.doesNotMatch(file, /legacy-api-routes\/v1/);
  }
  const handler = source(`${rust}workspaces_wsid_users_approvals.rs`);
  assert.match(handler, /_ => return None/);
});
