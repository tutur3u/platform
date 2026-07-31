import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(file: string) {
  return readFileSync(new URL(file, import.meta.url), 'utf8');
}

describe('historical AI observability interactions', () => {
  it('opens every historical activity from the row or request control', () => {
    const runs = source('./observability-runs.tsx');

    expect(runs).toContain('onClick={toggleOpen}');
    expect(runs).toContain("data-state={open ? 'open' : 'closed'}");
    expect(runs).toContain('{open ? (');
    expect(runs).not.toContain('{expandable && open ? (');
    expect(runs).not.toContain('const expandable =');
  });

  it('keeps ledger events inspectable without requesting a missing run trace', () => {
    const runs = source('./observability-runs.tsx');

    expect(runs).toContain(
      "enabled: open && run.sourceType !== 'workspace_credit'"
    );
    expect(runs).toContain(
      "const hasPersistedTrace = run.sourceType !== 'workspace_credit'"
    );
    expect(runs).toContain('<ObservabilityRunDetail');
  });

  it('makes each persisted historical step expandable', () => {
    const detail = source('./observability-run-detail.tsx');

    expect(detail).toContain('steps.map((step)');
    expect(detail).toContain('<HistoricalStep');
    expect(detail).toContain('<Collapsible');
    expect(detail).toContain('<CollapsibleTrigger');
    expect(detail).toContain('<CollapsibleContent');
  });

  it('deep-links overview activity and keeps the selected run in the URL', () => {
    const filters = source('./observability-filters.ts');
    const panel = source('./observability-panel.tsx');
    const overview = source('./overview/overview-activity.tsx');

    expect(filters).toContain("useQueryState(\n    'run'");
    expect(panel).toContain('selectedRunId={controls.selectedRunId}');
    expect(panel).toContain('onSelectedRunChange');
    expect(overview).toContain('runs?run=');
    expect(overview).toContain('encodeURIComponent(run.id)');
  });

  it('keeps every observability filter shareable through the URL', () => {
    const filters = source('./observability-filters.ts');

    expect(filters).toContain('useQueryStates(filterParsers');
    for (const key of ['feature', 'from', 'model', 'range', 'status', 'to']) {
      expect(filters, key).toContain(`${key}: parseAs`);
    }
  });
});
