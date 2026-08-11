import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8');
const appLayout = readFileSync(
  new URL('./(app)/layout.tsx', import.meta.url),
  'utf8'
);
const appPage = readFileSync(
  new URL('./(app)/page.tsx', import.meta.url),
  'utf8'
);

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

  it('keeps request-aware server layout inside a suspense boundary', () => {
    expect(appLayout).toContain("import { Suspense } from 'react'");

    const suspense = appLayout.indexOf('<Suspense>');
    const serverLayout = appLayout.indexOf('<ServerLayout>');
    const suspenseEnd = appLayout.indexOf('</Suspense>');
    expect(suspense).toBeGreaterThan(-1);
    expect(suspense).toBeLessThan(serverLayout);
    expect(serverLayout).toBeLessThan(suspenseEnd);
  });

  it('keeps the theme provider outside root suspense boundaries', () => {
    expect(layout).not.toContain('<Suspense>');
  });

  it('renders the authenticated meeting list at request time', () => {
    expect(appPage).toContain("import { connection } from 'next/server'");
    expect(appPage).toContain('await connection()');

    const suspense = appPage.indexOf('<Suspense>');
    const requestTimePage = appPage.indexOf(
      '<RequestTimeMeetPage searchParams={searchParams} />'
    );
    const suspenseEnd = appPage.indexOf('</Suspense>');
    const connectionCall = appPage.indexOf('await connection()');
    expect(suspense).toBeGreaterThan(-1);
    expect(suspense).toBeLessThan(requestTimePage);
    expect(requestTimePage).toBeLessThan(suspenseEnd);
    expect(connectionCall).toBeGreaterThan(suspenseEnd);
  });
});
