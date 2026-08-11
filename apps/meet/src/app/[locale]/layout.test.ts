import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8');

describe('meet root layout providers', () => {
  it('mounts the nuqs adapter', () => {
    // Without it, any descendant calling useQueryState throws
    // "[nuqs] nuqs requires an adapter to work with your framework" at render,
    // which surfaces as the recovery-mode error boundary in production.
    expect(layout).toContain(
      "import { NuqsAdapter } from 'nuqs/adapters/next/app'"
    );
    expect(layout).toContain('<NuqsAdapter>');
    expect(layout).toContain('</NuqsAdapter>');
  });

  it('keeps the adapter outside the app providers', () => {
    const adapter = layout.indexOf('<NuqsAdapter>');
    const providers = layout.indexOf('<Providers');
    expect(adapter).toBeGreaterThan(-1);
    expect(adapter).toBeLessThan(providers);
  });

  it('keeps request-aware providers inside a suspense boundary', () => {
    expect(layout).toContain(
      "import { type ReactNode, Suspense } from 'react'"
    );

    const suspense = layout.indexOf('<Suspense>');
    const adapter = layout.indexOf('<NuqsAdapter>');
    const providers = layout.indexOf('<Providers');
    const suspenseEnd = layout.indexOf('</Suspense>');

    expect(suspense).toBeGreaterThan(-1);
    expect(suspense).toBeLessThan(adapter);
    expect(adapter).toBeLessThan(providers);
    expect(providers).toBeLessThan(suspenseEnd);
  });
});
