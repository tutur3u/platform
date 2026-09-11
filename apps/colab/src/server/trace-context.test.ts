import type { Trace } from '@tuturuuu/multiplayer';
import { expect, it } from 'vitest';
import { traceContext } from './trace-context';

it('retains complete earlier reads after more than six actions', () => {
  const entries = Array.from({ length: 12 }, (_, index) => ({
    tool: index === 0 ? 'drive.read' : 'drive.search',
    input: '{}',
    output: 'evidence'.repeat(200),
  })) as Trace[];
  const context = traceContext(entries);
  expect(context[0]?.output).toBe(entries[0]?.output);
  expect(context[1]?.output).toContain('ABBREVIATED');
  expect(context.at(-1)?.output).toBe(entries.at(-1)?.output);
});

it('keeps long runs bounded and explicitly marks omitted evidence', () => {
  const entries = Array.from({ length: 80 }, () => ({
    tool: 'drive.read',
    input: '{}',
    output: 'evidence'.repeat(900),
  })) as Trace[];
  const context = traceContext(entries);
  expect(JSON.stringify(context).length).toBeLessThanOrEqual(120_000);
  expect(context[0]?.output).toContain('read the record again');
  expect(context.at(-1)?.output).toBe(entries.at(-1)?.output);
});
