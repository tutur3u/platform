import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileIeeaiInviteTypes } from './ieeai-free-invite-types.mjs';

const baseline = `export type Database = { private: {
  Tables: { unrelated: { Row: { retained: string } } };
  Functions: { unrelated_rpc: { Args: { retained: string }; Returns: boolean } };
} };`;
const candidate = `export type Database = { private: {
  Tables: {
    ieeai_invite_acceptances: { Row: { actor_id: string; role_ids: string[] } };
    unrelated: { Row: { incompatible_generator_drift: number } };
  };
  Functions: {
    accept_ieeai_free_workspace_invite: { Args: { p_actor_id: string }; Returns: boolean };
    unrelated_rpc: { Args: {}; Returns: number };
  };
} };`;

test('generated contracts preserve unrelated committed declarations and retries', () => {
  const result = reconcileIeeaiInviteTypes(baseline, candidate);
  assert.match(result, /role_ids: string\[\]/);
  assert.match(result, /p_actor_id: string/);
  assert.match(result, /unrelated: \{ Row: \{ retained: string \} \}/);
  assert.match(
    result,
    /unrelated_rpc: \{ Args: \{ retained: string \}; Returns: boolean \}/
  );
  assert.doesNotMatch(result, /incompatible_generator_drift/);
  assert.equal(reconcileIeeaiInviteTypes(result, candidate), result);
});

test('missing generated RPC prevents generation', () => {
  assert.throws(
    () =>
      reconcileIeeaiInviteTypes(
        baseline,
        candidate.replace('accept_ieeai_free_workspace_invite', 'other_rpc')
      ),
    /Expected exactly one generated/
  );
});

test('duplicate generated audit declarations prevent generation', () => {
  const duplicate = candidate.replace(
    'unrelated: { Row:',
    'ieeai_invite_acceptances: { Row:'
  );
  assert.throws(
    () => reconcileIeeaiInviteTypes(baseline, duplicate),
    /Expected exactly one generated/
  );
});
