// @vitest-environment jsdom
import type { LettinArtwork } from '@tuturuuu/internal-api/lettin';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import { ArtworkGallery } from './artwork-gallery';
import { ArtworkViewer } from './artwork-viewer';

let locale: 'en' | 'vi' = 'en';
vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: keyof typeof en.lettin, values?: Record<string, string | number>) => {
      let text = (locale === 'vi' ? viMessages : en).lettin[key];
      for (const [name, value] of Object.entries(values ?? {}))
        text = text.replace(`{${name}}`, String(value));
      return text;
    },
}));
const item: LettinArtwork = {
  image: '/api/v1/lettin/media/00000000-0000-4000-8000-000000000001',
  alt: 'Portrait',
  caption: '<script>Caption</script>',
  credit: '<b>Artist</b>',
};
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it.each(['en', 'vi'] as const)(
  'opens only on request, preserves metadata and returns focus on close (%s)',
  async (language) => {
    locale = language;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(() => root.render(<ArtworkViewer item={item} number={2} />));
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(host.querySelectorAll('img')).toHaveLength(1);
      const trigger = host.querySelector('button')!;
      const messages = language === 'vi' ? viMessages.lettin : en.lettin;
      expect(trigger.getAttribute('aria-label')).toBe(
        messages.viewArtwork.replace('{number}', '2')
      );
      trigger.focus();
      await act(() => trigger.click());
      const dialog = document.querySelector('[role="dialog"]')!;
      expect(dialog).not.toBeNull();
      expect(dialog.textContent).toContain(
        messages.artworkViewerTitle.replace('{number}', '2')
      );
      const image = dialog.querySelector('img')!;
      expect(image.getAttribute('src')).toBe(item.image);
      expect(image.alt).toBe(item.alt);
      expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
      expect(dialog.querySelector('script, b, a[download]')).toBeNull();
      expect(dialog.textContent).toContain(item.caption);
      expect(dialog.textContent).toContain(item.credit);
      const close = dialog.querySelector('button')!;
      expect(close.textContent).toBe(messages.closeArtwork);
      await act(async () => {
        close.click();
      });
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      await act(() => trigger.click());
      await act(() =>
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        )
      );
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(document.activeElement).toBe(trigger);
    } finally {
      await act(() => root.unmount());
      host.remove();
    }
  }
);

it('retains direct safe URLs while excluding unsafe legacy media before viewer rendering', () => {
  for (const image of [
    'javascript:alert(1)',
    'https://user:password@example.test/a',
    '/private/draft.png',
  ]) {
    expect(
      renderToStaticMarkup(
        <ArtworkViewer item={{ ...item, image }} number={1} />
      )
    ).toBe('');
  }
  const html = renderToStaticMarkup(
    <ArtworkViewer
      item={{ ...item, image: 'https://example.test/art.png' }}
      number={1}
    />
  );
  expect(html).toContain('https://example.test/art.png');
  expect(html).not.toContain('role="dialog"');
});

it('keeps the gallery bounded and ordered without opening twelve original views', () => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <ArtworkGallery
      items={Array.from({ length: 14 }, (_, index) => ({
        ...item,
        alt: `Art ${index + 1}`,
      }))}
    />
  );
  expect(host.querySelectorAll('figure')).toHaveLength(12);
  expect(host.querySelectorAll('button')).toHaveLength(12);
  expect(host.querySelectorAll('img')).toHaveLength(12);
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector('img')?.alt).toBe('Art 1');
  expect([...host.querySelectorAll('img')].at(-1)?.alt).toBe('Art 12');
});
