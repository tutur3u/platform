import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveStatusPageLocale,
  STATUS_PAGE_COPY,
  StatusPage,
  StatusPageDocument,
  type StatusPageLocale,
  type StatusPageVariant,
} from './index';

/** Problems with a server-rendered status page; empty when it is sound. */
function statusMarkupProblems(
  html: string,
  locale: StatusPageLocale,
  variant: StatusPageVariant
): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const copy = STATUS_PAGE_COPY[locale];
  const problems: string[] = [];
  const headings = doc.querySelectorAll('h1');
  if (headings.length !== 1) problems.push(`h1 count ${headings.length}`);
  if (headings[0]?.textContent !== copy[variant].title)
    problems.push('h1 copy');
  for (const landmark of ['header', 'main', 'footer']) {
    if (doc.querySelectorAll(landmark).length !== 1)
      problems.push(`${landmark} landmark`);
  }
  if (doc.querySelector('script')) problems.push('script element');
  if (
    !doc.querySelector('style')?.textContent?.includes('prefers-color-scheme')
  )
    problems.push('theme css');
  const links = [...doc.querySelectorAll('a')].map((a) => ({
    href: a.getAttribute('href'),
    text: a.textContent,
  }));
  if (
    !links.some(
      (l) => l.href === 'https://tuturuuu.com' && l.text === copy.home
    )
  )
    problems.push('home link');
  if (!links.some((l) => l.href === '/tasks' && l.text === copy.back))
    problems.push('back link');
  if (!links.some((l) => l.href === '/tasks/search' && l.text === copy.search))
    problems.push('search link');
  const mark = doc.querySelector('header svg[data-tuturuuu-mark]');
  if (!mark || mark.getAttribute('aria-hidden') !== 'true')
    problems.push('inline logo');
  // Same-origin only: no absolute image or resource URL, so a mounted app's
  // report-only CSP (img-src limited to its own path) records no violation.
  const remote = [...doc.querySelectorAll('[src], [srcset], link[href]')]
    .map(
      (node) =>
        node.getAttribute('src') ??
        node.getAttribute('srcset') ??
        node.getAttribute('href') ??
        ''
    )
    .filter((url) => /^(?:https?:)?\/\//i.test(url.trim()));
  if (remote.length > 0 || /url\(\s*['"]?(?:https?:)?\/\//i.test(html))
    problems.push('remote image');
  return problems;
}

const cases = (['en', 'vi'] as const).flatMap((locale) =>
  (['not-found', 'error'] as const).map((variant) => ({ locale, variant }))
);

describe('StatusPage', () => {
  it.each(cases)(
    'server-renders $variant in $locale with one h1, links and CSS-only theming',
    ({ locale, variant }) => {
      const html = renderToStaticMarkup(
        <StatusPageDocument
          appHref="/tasks"
          appName="Tasks"
          locale={locale}
          onRetry={() => undefined}
          searchHref="/tasks/search"
          variant={variant}
        />
      );
      expect(statusMarkupProblems(html, locale, variant)).toEqual([]);
      expect(html).toContain(`<html lang="${locale}"`);
      expect(html).toContain(STATUS_PAGE_COPY[locale][variant].documentTitle);
      if (variant === 'error')
        expect(html).toContain(STATUS_PAGE_COPY[locale].retry);
      else expect(html).not.toContain(STATUS_PAGE_COPY[locale].retry);
    }
  );

  it('flags a broken variant: theme script, two h1s and no home link', () => {
    const good = renderToStaticMarkup(
      <StatusPageDocument
        appHref="/tasks"
        locale="en"
        searchHref="/tasks/search"
        variant="not-found"
      />
    );
    const broken = good
      .replace(
        '</head>',
        '<script>document.documentElement.classList.add("dark")</script></head>'
      )
      .replace('href="https://tuturuuu.com"', 'href="/elsewhere"')
      .replaceAll('href="https://tuturuuu.com"', 'href="/elsewhere"')
      .replace('</main>', '<h1>404</h1></main>');
    expect(statusMarkupProblems(broken, 'en', 'not-found')).toEqual(
      expect.arrayContaining(['h1 count 2', 'script element', 'home link'])
    );
  });

  it('flags a broken variant: the remote tuturuuu.com logo image', () => {
    const good = renderToStaticMarkup(
      <StatusPageDocument
        appHref="/tasks"
        locale="en"
        searchHref="/tasks/search"
        variant="not-found"
      />
    );
    expect(good).not.toMatch(/https:\/\/[^"]*\.(?:png|svg|jpe?g|webp)/);
    const remoteLogo = good.replace(
      /<svg[^>]*data-tuturuuu-mark[\s\S]*?<\/svg>/,
      '<img alt="" height="28" src="https://tuturuuu.com/media/logos/transparent.png" width="28"/>'
    );
    expect(remoteLogo).not.toBe(good);
    expect(statusMarkupProblems(remoteLogo, 'en', 'not-found')).toEqual([
      'inline logo',
      'remote image',
    ]);
    const preloaded = good.replace(
      '</head>',
      '<link rel="preload" as="image" href="https://tuturuuu.com/media/logos/transparent.png"/></head>'
    );
    expect(statusMarkupProblems(preloaded, 'en', 'not-found')).toEqual([
      'remote image',
    ]);
  });

  it('keeps EN and VI copy keys in parity', () => {
    const keys = (value: object): string[] =>
      Object.entries(value).flatMap(([key, child]) =>
        typeof child === 'object' && child
          ? keys(child).map((nested) => `${key}.${nested}`)
          : [key]
      );
    expect(keys(STATUS_PAGE_COPY.vi).sort()).toEqual(
      keys(STATUS_PAGE_COPY.en).sort()
    );
  });

  it('resolves the locale from tags, document lang and URL paths', () => {
    expect(resolveStatusPageLocale('vi-VN')).toBe('vi');
    expect(resolveStatusPageLocale('/vi/tasks/missing')).toBe('vi');
    expect(resolveStatusPageLocale('/roadmap/vi/missing')).toBe('vi');
    expect(resolveStatusPageLocale('/en/vi')).toBe('en');
    expect(resolveStatusPageLocale(undefined, '/vi')).toBe('vi');
    expect(resolveStatusPageLocale('/tasks/vi')).toBe('en');
    expect(resolveStatusPageLocale(null)).toBe('en');
  });

  it('runs the framework retry and falls back to href for Back', () => {
    const retry = vi.fn();
    render(
      <StatusPage
        appHref="/calendar"
        appName="Calendar"
        locale="en"
        onRetry={retry}
        variant="error"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Go back' })).toHaveAttribute(
      'href',
      '/calendar'
    );
    expect(screen.getByRole('link', { name: 'Open Calendar' })).toHaveAttribute(
      'href',
      '/calendar'
    );
  });

  it('inline chrome keeps a nested boundary inside the app shell', () => {
    const html = renderToStaticMarkup(
      <StatusPage chrome="inline" locale="vi" variant="error" />
    );
    expect(html).not.toContain('<header');
    expect(html).not.toContain('<main');
    expect(html).toContain('Đã có lỗi xảy ra');
  });
});
