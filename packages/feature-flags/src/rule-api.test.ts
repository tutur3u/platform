import { describe, expect, it } from 'vitest';
import {
  parseRuleListQuery,
  parseRuleWrite,
  ruleWriteResponse,
  ruleWriteRpcArgs,
} from './rule-api';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const OP = '22222222-2222-4222-8222-222222222222';
const WS = '33333333-3333-4333-8333-333333333333';
const definition = {
  controllers: { platform: 'platform-admin', workspace: 'platform-admin' },
  scopes: ['platform', 'workspace'],
} as const;
const context = {
  actorId: ACTOR,
  client: 'ttr' as const,
  definitionFor: (key: string) => (key === 'FLAG_A' ? definition : undefined),
};
const valid = {
  environment: 'production',
  expectedRevision: 0,
  flagKey: 'FLAG_A',
  mode: 'staff',
  operationId: OP,
  reason: 'Staff first',
  scope: 'platform',
  subjectId: null,
};

describe('parseRuleWrite', () => {
  it('derives the actor and client from the session, not the body', () => {
    const parsed = parseRuleWrite(valid, context);
    expect(parsed.ok && ruleWriteRpcArgs(parsed.command)).toMatchObject({
      p_actor: ACTOR,
      p_client: 'ttr',
      p_mode: 'staff',
      p_subject_id: null,
    });
  });

  it('refuses forged or unknown fields', () => {
    for (const field of [
      'actorId',
      'actor',
      'client',
      'updatedBy',
      'occurredAt',
    ]) {
      expect(parseRuleWrite({ ...valid, [field]: ACTOR }, context)).toEqual({
        error: 'forbidden_field',
        ok: false,
        status: 400,
      });
    }
    expect(parseRuleWrite([valid], context)).toMatchObject({ status: 400 });
    expect(parseRuleWrite(null, context)).toMatchObject({ status: 400 });
  });

  it('reports the first validation failure with its status', () => {
    expect(parseRuleWrite({ ...valid, flagKey: 'NOPE' }, context)).toEqual({
      error: 'feature_flag_unknown_flag',
      ok: false,
      status: 404,
    });
    expect(
      parseRuleWrite({ ...valid, mode: 'rollout', percentage: 101 }, context)
    ).toMatchObject({ error: 'feature_flag_invalid_percentage', status: 422 });
    expect(
      parseRuleWrite(
        { ...valid, scope: 'user', subjectId: WS, mode: 'on' },
        context
      )
    ).toMatchObject({ error: 'feature_flag_scope_not_declared', status: 422 });
    expect(parseRuleWrite({ ...valid, reason: '  ' }, context)).toMatchObject({
      error: 'feature_flag_invalid_reason',
    });
    expect(
      parseRuleWrite({ ...valid, expectedRevision: -1 }, context)
    ).toMatchObject({ error: 'feature_flag_invalid_revision' });
  });

  it('refuses a body without a mode and a NUL in the reason', () => {
    const { mode: _mode, ...withoutMode } = valid;
    expect(parseRuleWrite(withoutMode, context)).toEqual({
      error: 'feature_flag_invalid_mode',
      ok: false,
      status: 422,
    });
    expect(
      parseRuleWrite({ ...valid, reason: 'a\u0000b' }, context)
    ).toMatchObject({ error: 'feature_flag_invalid_reason', status: 422 });
  });

  it('accepts an unset rule and a workspace rule', () => {
    expect(parseRuleWrite({ ...valid, mode: null }, context)).toMatchObject({
      ok: true,
    });
    expect(
      parseRuleWrite(
        { ...valid, scope: 'workspace', subjectId: WS, mode: 'on' },
        context
      )
    ).toMatchObject({ ok: true });
  });
});

describe('ruleWriteResponse', () => {
  const ok = (status: string, extra: Record<string, unknown> = {}) => ({
    data: { flagKey: 'FLAG_A', status, revision: 3, ...extra },
    error: null,
  });

  it('maps applied, replayed and noop to 200 and a conflict to 409', () => {
    for (const status of ['applied', 'replayed', 'noop']) {
      expect(ruleWriteResponse(ok(status))).toMatchObject({ status: 200 });
    }
    expect(ruleWriteResponse(ok('conflict'))).toEqual({
      body: { error: 'conflict', revision: 3 },
      status: 409,
    });
  });

  it('maps database failures to stable codes', () => {
    const fail = (message: string, code: string) =>
      ruleWriteResponse({ data: null, error: { code, message } });
    expect(fail('feature_flag_denied', '42501')).toEqual({
      body: { error: 'denied' },
      status: 403,
    });
    expect(fail('feature_flag_unknown_flag', '22023').status).toBe(404);
    expect(fail('feature_flag_operation_conflict', '22023').status).toBe(409);
    expect(fail('feature_flag_subject_erasing', '22023').status).toBe(409);
    expect(fail('feature_flag_rule_limit', '54000').status).toBe(422);
    expect(fail('feature_flag_invalid_mode', '22023')).toEqual({
      body: { error: 'feature_flag_invalid_mode' },
      status: 422,
    });
    expect(fail('boom', 'XX000')).toEqual({
      body: { error: 'storage_unavailable' },
      status: 503,
    });
    expect(ruleWriteResponse({ data: 'x', error: null }).status).toBe(503);
    expect(ruleWriteResponse(ok('surprise')).status).toBe(503);
  });

  it('does not report a replay for a different rule as applied', () => {
    expect(
      ruleWriteResponse(ok('replayed', { matchesRequest: false }))
    ).toEqual({
      body: { error: 'feature_flag_operation_mismatch' },
      status: 409,
    });
    expect(
      ruleWriteResponse(ok('replayed', { matchesRequest: true })).status
    ).toBe(200);
  });

  it('never returns the actor', () => {
    const response = ruleWriteResponse(
      ok('applied', { actorId: ACTOR, updatedBy: ACTOR })
    );
    expect(JSON.stringify(response.body)).not.toContain(ACTOR);
  });
});

describe('parseRuleListQuery', () => {
  const q = (query: string) => parseRuleListQuery(new URLSearchParams(query));

  it('defaults to production and 500 rows', () => {
    expect(q('')).toEqual({
      after: null,
      environment: 'production',
      flagKey: null,
      limit: 500,
    });
  });

  it('parses a cursor and rejects malformed input', () => {
    expect(
      q(`afterFlagKey=A&afterScope=workspace&afterSubjectId=${WS}&limit=10`)
    ).toMatchObject({
      after: { flagKey: 'A', scope: 'workspace', subjectId: WS },
    });
    expect(q('environment=staging')).toBeNull();
    expect(q('limit=0')).toBeNull();
    expect(q('limit=1001')).toBeNull();
    expect(q('flagKey=bad-key')).toBeNull();
    expect(q('afterFlagKey=A')).toBeNull();
    expect(q('afterFlagKey=bad-key&afterScope=platform')).toBeNull();
    expect(q('afterFlagKey=A&afterScope=x')).toBeNull();
    expect(q('afterFlagKey=A&afterScope=user&afterSubjectId=nope')).toBeNull();
  });
});
