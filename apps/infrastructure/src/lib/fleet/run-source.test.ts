import { describe, expect, it } from 'vitest';
import { describeRunSource, getRunSourceLabel } from './run-source';

const SHA = 'a'.repeat(40);

function envelope(payload: unknown) {
  return [
    '__ttr_commit_run_v1__',
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
  ];
}

describe('describeRunSource', () => {
  it('decodes a commit-run envelope into sha, directory and argv', () => {
    const source = describeRunSource(
      envelope({ command: ['bun', 'test'], prefix: 'apps/web', sha: SHA, v: 1 })
    );

    expect(source).toEqual({
      argv: ['bun', 'test'],
      kind: 'commit',
      prefix: 'apps/web',
      sha: SHA,
    });
    expect(getRunSourceLabel(source)).toBe('bun test');
  });

  it('rejects malformed envelopes instead of guessing', () => {
    expect(describeRunSource(['__ttr_commit_run_v1__']).kind).toBe(
      'invalid_envelope'
    );
    expect(describeRunSource(['__ttr_commit_run_v1__', '%%%']).kind).toBe(
      'invalid_envelope'
    );
    expect(
      describeRunSource(
        envelope({ command: ['bun'], prefix: '', sha: 'short', v: 1 })
      ).kind
    ).toBe('invalid_envelope');
    expect(
      describeRunSource(
        envelope({ command: ['bun'], prefix: '', sha: SHA, v: 2 })
      ).kind
    ).toBe('invalid_envelope');
    expect(getRunSourceLabel({ kind: 'invalid_envelope' })).toBeNull();
  });

  it('names maintenance envelopes and passes plain argv through', () => {
    expect(describeRunSource(['__ttr_restart_agent_v1__'])).toEqual({
      kind: 'maintenance',
      name: 'restart_agent_v1',
    });
    expect(describeRunSource(['bun', 'lint'])).toEqual({
      argv: ['bun', 'lint'],
      kind: 'command',
    });
  });
});
