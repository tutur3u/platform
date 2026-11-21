import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketingShell } from './marketing-shell';
import { createTranslator } from './i18n';
import { NavMenuBar } from './nav-dropdown';
import { MarketingActions } from './nav-actions';

const setTheme = vi.fn();
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'system', setTheme }),
}));
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

for (const locale of ['en', 'vi'] as const) {
  it(`combines language and theme in one named control (${locale})`, () => {
    const onLocaleChange = vi.fn();
    act(() =>
      root.render(
        <MarketingActions
          t={createTranslator(locale)}
          locale={locale}
          pathname="/"
          onLocaleChange={onLocaleChange}
        />
      )
    );
    const triggers = [...container.querySelectorAll('button[aria-expanded]')];
    // One preference control and the menu button: no separate locale or
    // theme pills.
    expect(triggers).toHaveLength(2);
    const button = triggers[0] as HTMLButtonElement;
    // Named by its contents, starting with the visible locale (label in name).
    expect(button.hasAttribute('aria-label')).toBe(false);
    const name = button.textContent!.replace(/\s+/g, ' ').trim();
    expect(name).toBe(
      locale === 'en' ? 'en – Language, Theme' : 'vi – Ngôn ngữ, Giao diện'
    );
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[role="group"]')).toBeNull();

    act(() => button.click());
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const panel = container.querySelector('[role="group"]')!;
    expect(button.getAttribute('aria-controls')).toBe(panel.id);
    const legends = [...panel.querySelectorAll('legend')].map(
      (legend) => legend.textContent
    );
    expect(legends).toEqual(
      locale === 'en' ? ['Language', 'Theme'] : ['Ngôn ngữ', 'Giao diện']
    );
    const radios = [
      ...panel.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ];
    expect(radios.map((radio) => radio.value)).toEqual([
      'en',
      'vi',
      'light',
      'dark',
      'system',
    ]);
    expect(radios.find((radio) => radio.checked)?.value).toBe(locale);
    const other = locale === 'en' ? 'vi' : 'en';
    const destination = radios.find((radio) => radio.value === other)!;
    expect(
      destination
        .closest('label')
        ?.querySelector('[lang]')
        ?.getAttribute('lang')
    ).toBe(other);
    act(() => destination.click());
    expect(onLocaleChange).toHaveBeenCalledWith(other);
    act(() => radios.find((radio) => radio.value === 'dark')!.click());
    expect(setTheme).toHaveBeenCalledWith('dark');

    act(() =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
    );
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
}

it('offers the theme alone when the host cannot switch language', () => {
  act(() =>
    root.render(
      <MarketingActions t={createTranslator('en')} locale="en" pathname="/" />
    )
  );
  const button = container.querySelector('button[aria-expanded]')!;
  expect(button.textContent!.trim()).toBe('– Theme');
  act(() => (button as HTMLButtonElement).click());
  expect(
    [...container.querySelectorAll('input[type="radio"]')].map(
      (radio) => (radio as HTMLInputElement).value
    )
  ).toEqual(['light', 'dark', 'system']);
});

it('sizes every navbar control from the floating-bar tokens', async () => {
  const { navControl } = await import('./nav-styles');
  expect(navControl).toContain('h-(--bar-control-height)');
  expect(navControl).toContain('rounded-(--radius-bar-inner)');
  const html = renderToStaticMarkup(
    <MarketingShell
      t={createTranslator('en')}
      locale="en"
      pathname="/"
      logoSrc="/logo.png"
      navCompact
      onLocaleChange={() => {}}
    >
      <main />
    </MarketingShell>
  );
  // A ring, not a border, outlines the bar, so the scrolled surface never
  // moves the layout; the bar derives its radii as a floating bar.
  expect(html).toContain('data-slot="floating-bar"');
  expect(html).not.toMatch(/id="navbar-content"[^>]*\bborder\b/u);
  // Server HTML (no JavaScript yet) has no blur, the lite-safe default.
  expect(html).toContain('ring-border');
  expect(html).not.toContain('backdrop-blur');
});

it('closes the mobile sheet on a desktop-width viewport', async () => {
  // matchMedia is stubbed to match, as at md and wider.
  const { MobileMenu } = await import('./mobile-menu');
  act(() =>
    root.render(
      <MobileMenu
        initiallyOpen
        locale="en"
        pathname="/"
        signInHref="/login"
        siteUrl=""
        t={createTranslator('en')}
      />
    )
  );
  expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull();
  expect(
    container
      .querySelector('button[aria-expanded]')
      ?.getAttribute('aria-expanded')
  ).toBe('false');
});
