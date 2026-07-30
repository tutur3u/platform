import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(file: string) {
  return readFileSync(new URL(file, import.meta.url), 'utf8');
}

describe('playground step inspector', () => {
  it('makes every execution step independently expandable', () => {
    const inspector = source('./playground-step-inspector.tsx');

    expect(inspector).toContain('steps.map((step)');
    expect(inspector).toContain('<Collapsible');
    expect(inspector).toContain('<CollapsibleTrigger');
    expect(inspector).toContain('<CollapsibleContent');
    expect(inspector).toContain('expanded.has(step.sequence)');
  });

  it('supports expand-all and safe model and tool detail views', () => {
    const inspector = source('./playground-step-inspector.tsx');
    const details = source('./playground-step-details.tsx');

    expect(inspector).toContain('steps.map((step) => step.sequence)');
    expect(inspector).toContain('safe_trace_note');
    expect(details).toContain('ModelStepDetails');
    expect(details).toContain('ToolStepDetails');
    expect(details).toContain('tool_input');
    expect(details).toContain('tool_output');
  });
});
