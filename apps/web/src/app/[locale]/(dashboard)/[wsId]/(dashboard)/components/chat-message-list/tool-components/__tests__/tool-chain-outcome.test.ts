import { describe, expect, it } from 'vitest';
import type { ToolPartData } from '../../types';
import { getToolChainOutcome } from '../tool-chain-outcome';

function part(
  state: string,
  input: unknown = { taskId: 'a', wsId: 'w' },
  output?: unknown
): ToolPartData {
  return {
    type: 'tool-complete_task',
    toolCallId: crypto.randomUUID(),
    state,
    input,
    output,
  } as ToolPartData;
}

describe('tool chain recovery', () => {
  it('recognizes retries separated by text without reordering either batch', () => {
    const failed = part('output-error');
    const success = part('output-available');
    const history = [failed, success];
    expect(getToolChainOutcome([failed], history).status).toBe('recovered');
    expect(getToolChainOutcome([success], history).status).toBe('done');
  });
  it('recovers only a later successful retry and survives serialization', () => {
    const parts = [
      part('output-error'),
      part('output-available', { wsId: 'w', taskId: 'a' }, { success: true }),
    ];
    for (const history of [parts, JSON.parse(JSON.stringify(parts))]) {
      const result = getToolChainOutcome(history);
      expect(result.status).toBe('recovered');
      expect(result.failedCount).toBe(0);
      expect(result.recovered.has(history[0])).toBe(true);
    }
  });
  it('does not conceal failures for another task or workspace', () => {
    expect(
      getToolChainOutcome([
        part('output-error'),
        part('output-available', { taskId: 'b', wsId: 'w' }),
      ]).failedCount
    ).toBe(1);
    expect(
      getToolChainOutcome([
        part('output-error'),
        part('output-available', { taskId: 'a', wsId: 'other' }),
      ]).status
    ).toBe('error');
  });
  it('counts failed attempts rather than every tool in the chain', () => {
    expect(
      getToolChainOutcome([part('output-available'), part('output-error')])
        .failedCount
    ).toBe(1);
  });
  it('keeps logical failures and pending retries unresolved', () => {
    expect(
      getToolChainOutcome([
        part('output-error'),
        part('output-available', undefined, { success: false }),
      ]).status
    ).toBe('error');
    expect(
      getToolChainOutcome([part('output-error'), part('input-available')])
        .status
    ).toBe('running');
  });
  it('matches valid raw input but never missing or malformed input', () => {
    const failed = {
      ...part('output-error'),
      input: undefined,
      rawInput: '{"taskId":"a","wsId":"w"}',
    } as ToolPartData;
    expect(getToolChainOutcome([failed, part('output-available')]).status).toBe(
      'recovered'
    );
    expect(
      getToolChainOutcome([
        { ...failed, rawInput: '{' } as ToolPartData,
        part('output-available'),
      ]).status
    ).toBe('error');
  });
});
