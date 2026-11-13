import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketingShell } from './marketing-shell';
import { createTranslator } from './i18n';
import { NavMenuBar } from './nav-dropdown';
import { MarketingActions } from './nav-actions';
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('shared marketing shell contract', () => {
  for (const locale of ['en', 'vi'] as const)
    it(`renders the brand and localized navigation in server HTML (${locale})`, () => {
      const html = renderToStaticMarkup(
        <MarketingShell
          t={createTranslator(locale)}
          locale={locale}
          pathname="/"
          logoSrc="/logo.png"
          actions={<span>controls</span>}
        >
          <h1>Content</h1>
        </MarketingShell>
      );
      expect(html).toContain('Tuturuuu');
      expect(html).toContain(locale === 'en' ? 'Products' : 'Các sản phẩm');
      expect(html).toContain('id="main-content"');
      expect(html).toContain('src="/logo.png"');
      expect(html).not.toMatch(/rel="(?:prefetch|prerender)"/u);
    });
  it('keeps closed menu links hidden and supports click/Escape', () => {
    act(() =>
      root.render(
        <NavMenuBar
          ariaLabel="Navigation"
          menus={[
            {
              id: 'products',
              label: 'Products',
              width: 400,
              content: <a href="/products">Explore</a>,
            },
          ]}
        />
      )
    );
    const button = container.querySelector('button')!;
    const panel = container.querySelector('#nav-sheet-products')!;
    expect(panel.hasAttribute('hidden')).toBe(true);
    act(() => button.click());
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hasAttribute('hidden')).toBe(false);
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
    );
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hasAttribute('hidden')).toBe(true);
  });
  it('server-renders a named mobile trigger before loading the sheet', () => {
    const html = renderToStaticMarkup(
      <MarketingActions t={createTranslator('en')} locale="en" pathname="/" />
    );
    expect(html).toContain('aria-label="Main navigation"');
    expect(html).not.toContain('data-slot="sheet-content"');
  });
});

it('ships small normal-weight EN/VI fonts with their licence', async () => {
  const { readFileSync, statSync } = await import('node:fs');
  const files = [
    'jetbrains-mono-400-latin.woff2',
    'jetbrains-mono-400-vietnamese.woff2',
  ];
  let bytes = 0;
  for (const name of files) {
    const file = resolve(import.meta.dirname, 'fonts', name);
    expect(readFileSync(file).subarray(0, 4).toString('ascii')).toBe('wOF2');
    bytes += statSync(file).size;
  }
  expect(bytes).toBeLessThan(35000);
  expect(
    readFileSync(
      resolve(import.meta.dirname, 'fonts/OFL-JetBrainsMono.txt'),
      'utf8'
    )
  ).toContain('SIL OPEN FONT LICENSE');
});
