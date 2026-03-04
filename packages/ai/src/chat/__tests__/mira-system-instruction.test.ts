import { describe, expect, it } from 'vitest';
import { buildMiraSystemInstruction } from '../mira-system-instruction';

describe('buildMiraSystemInstruction', () => {
  it('tells Mira to use action tools for actionable attachment digests', () => {
    const instruction = buildMiraSystemInstruction();

    expect(instruction).toContain('ATTACHMENT REQUESTS CAN BE ACTIONABLE');
    expect(instruction).toContain(
      'Do NOT assume attachment-only turns are summary-only.'
    );
  });

  it('forbids narrating tool names in assistant prose', () => {
    const instruction = buildMiraSystemInstruction();

    expect(instruction).toContain(
      'Never print a tool plan, tool name list, or JSON array of tool names in assistant text.'
    );
  });
});
