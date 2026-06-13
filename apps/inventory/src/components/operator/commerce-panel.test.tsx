import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CommercePanel } from './commerce-panel';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

describe('CommercePanel', () => {
  it('keeps commerce tabs visible while the active tab is loading locally', () => {
    const html = renderToStaticMarkup(
      <CommercePanel
        checkouts={[]}
        isLoading
        query=""
        sales={[]}
        setTab={() => undefined}
        tab="sales"
        wsId="ws-1"
      />
    );

    expect(html).toContain('checkouts');
    expect(html).toContain('sales');
    expect(html).toContain('animate-pulse');
    expect(html).not.toContain('emptyDescriptions.sales');
  });
});
