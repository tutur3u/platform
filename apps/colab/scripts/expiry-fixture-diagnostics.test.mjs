import { describe, expect, it } from 'vitest';
import { projectExpiryDiagnostics } from './expiry-fixture-diagnostics.mjs';

const record = (message) => ({ timestamp: 1, level: 'log', message });
const marker = (phase, caseName = 'failure') =>
  record(`colab-expiry-fixture:v1:${caseName}:${phase}`);

describe('expiry fixture closed diagnostics', () => {
  it('projects only observed closed phases and bounded counts', () => {
    expect(
      projectExpiryDiagnostics(
        [
          marker('fixture-entry'),
          marker('before-failure-alarm'),
          marker('caught'),
          marker('caught'),
          marker('rollback-verified'),
          marker('trigger-removed'),
          marker('100-wakes-complete'),
          marker('rpc-return'),
        ],
        'failure',
        'read-complete'
      )
    ).toEqual({
      observation: 'captured',
      case: 'failure',
      nodePhase: 'read-complete',
      phases: [
        { phase: 'fixture-entry', count: 1 },
        { phase: 'before-failure-alarm', count: 1 },
        { phase: 'caught', count: 2 },
        { phase: 'rollback-verified', count: 1 },
        { phase: 'trigger-removed', count: 1 },
        { phase: '100-wakes-complete', count: 1 },
        { phase: 'rpc-return', count: 1 },
      ],
      wakes: 100,
    });
  });

  it('does not fabricate completion or a Worker phase from absent logs', () => {
    expect(projectExpiryDiagnostics([], 'failure', 'fetch-start')).toEqual({
      observation: 'captured',
      case: 'failure',
      nodePhase: 'fetch-start',
      phases: [],
    });
    expect(
      projectExpiryDiagnostics(
        [marker('fixture-entry')],
        'failure',
        'read-start'
      )
    ).not.toHaveProperty('wakes');
  });

  it('discards foreign, malformed, decorated and oversized messages', () => {
    const secret = 'PRIVATE_SENTINEL';
    const valid = {
      ...marker('caught'),
      url: secret,
      stack: secret,
      config: { token: secret },
    };
    const result = projectExpiryDiagnostics(
      [
        marker('rpc-return', 'duplicates'),
        marker('foreign-phase'),
        record(`${valid.message} ${secret}`),
        record(`${secret}${'x'.repeat(2000)}`),
        record(JSON.stringify({ message: valid.message, secret })),
        { message: valid.message },
        { ...valid, timestamp: NaN },
        { ...valid, level: null },
        { ...valid, message: { secret } },
        null,
        secret,
        valid,
      ],
      'failure',
      'fetch-complete'
    );
    expect(result).toEqual({
      observation: 'captured',
      case: 'failure',
      nodePhase: 'fetch-complete',
      phases: [{ phase: 'caught', count: 1 }],
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('rejects oversized captures without reporting partial completion', () => {
    expect(
      projectExpiryDiagnostics(
        Array(257).fill(marker('100-wakes-complete')),
        'duplicates',
        'close-start'
      )
    ).toEqual({
      observation: 'unavailable',
      case: 'duplicates',
      nodePhase: 'close-start',
      phases: [],
    });
    expect(
      projectExpiryDiagnostics(
        { PRIVATE_SENTINEL: true },
        'failure',
        'close-complete'
      )
    ).toEqual({
      observation: 'unavailable',
      case: 'failure',
      nodePhase: 'close-complete',
      phases: [],
    });
  });

  it('accepts the duplicates case and caps counts at the capture bound', () => {
    expect(
      projectExpiryDiagnostics(
        Array(256).fill(marker('100-wakes-complete', 'duplicates')),
        'duplicates',
        'read-complete'
      )
    ).toEqual({
      observation: 'captured',
      case: 'duplicates',
      nodePhase: 'read-complete',
      phases: [{ phase: '100-wakes-complete', count: 256 }],
      wakes: 100,
    });
  });

  it('never reflects foreign case or Node phase values', () => {
    expect(
      projectExpiryDiagnostics([], 'PRIVATE_SENTINEL', 'fetch-start')
    ).toEqual({
      observation: 'invalid',
    });
    expect(projectExpiryDiagnostics([], 'failure', 'PRIVATE_SENTINEL')).toEqual(
      {
        observation: 'invalid',
      }
    );
  });
});
