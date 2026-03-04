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

  it('forbids closing successful action runs with no_action_needed', () => {
    const instruction = buildMiraSystemInstruction();

    expect(instruction).toContain(
      'do NOT call `select_tools` again just to choose `no_action_needed` as a closing step'
    );
    expect(instruction).toContain(
      'stop planning and produce the final assistant message in normal markdown/text'
    );
  });

  it('tells Mira how to progress explicit workspace switching without looping', () => {
    const instruction = buildMiraSystemInstruction();

    expect(instruction).toContain('WORKSPACE SWITCHING PROGRESSION');
    expect(instruction).toContain('do not loop on `get_workspace_context`');
    expect(instruction).toContain(
      'then call `set_workspace_context` with the concrete workspace ID/context'
    );
  });
});
