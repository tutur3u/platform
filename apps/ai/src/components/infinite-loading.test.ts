import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(file: string) {
  return readFileSync(new URL(file, import.meta.url), 'utf8');
}

describe('AI Studio infinite loading', () => {
  it('keeps every cursor-paginated module on the shared automatic loader', () => {
    for (const file of [
      './api-keys-panel.tsx',
      './catalog-panel.tsx',
      './observability-runs.tsx',
    ]) {
      expect(source(file), file).toContain('InfiniteLoadTrigger');
    }
  });

  it('loads near the viewport while preserving a manual fallback', () => {
    const trigger = source('./infinite-load-trigger.tsx');

    expect(trigger).toContain('IntersectionObserver');
    expect(trigger).toContain("rootMargin: '320px 0px'");
    expect(trigger).toContain('<Button');
    expect(trigger).toContain('requestedRef');
  });
});
