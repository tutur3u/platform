// @vitest-environment jsdom
import type { LettinArtwork } from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { ArtworkGallery } from './artwork-gallery';
import { ArtworkGalleryEditor } from './artwork-gallery-editor';

const state = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useMutation: () => state }));
vi.mock('@tuturuuu/internal-api/lettin', () => ({
  uploadLettinArtwork: vi.fn(),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    key === 'artworkCredit' ? `Credit: ${values?.credit}` : key,
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => <button {...props} />,
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
vi.mock('@tuturuuu/ui/textarea', () => ({
  Textarea: (props: ComponentProps<'textarea'>) => <textarea {...props} />,
}));
const item: LettinArtwork = {
  image: 'https://example.test/a.png',
  alt: 'A portrait',
  caption: 'Caption',
  credit: 'Artist',
};
const container = document.createElement('div');
const root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(async () => root.render(null));
  vi.clearAllMocks();
});
it('renders ordered accessible artwork with escaped metadata and revocable direct URLs', () => {
  const html = renderToStaticMarkup(
    <ArtworkGallery
      items={[
        { ...item, caption: '<script>test</script>', credit: '<b>Artist</b>' },
        {
          ...item,
          image: '/api/v1/lettin/media/00000000-0000-4000-8000-000000000001',
          alt: 'Second',
        },
      ]}
    />
  );
  expect(html).toContain('alt="A portrait"');
  expect(html).toContain('alt="Second"');
  expect(html.indexOf('A portrait')).toBeLessThan(html.indexOf('Second'));
  expect(html).toContain('loading="lazy"');
  expect(html).toContain('referrerPolicy="no-referrer"');
  expect(html).toContain('&lt;script&gt;test&lt;/script&gt;');
  expect(html).toContain('Credit: &lt;b&gt;Artist&lt;/b&gt;');
  expect(html).not.toContain('<script>');
});
it('omits absent galleries and unsafe legacy image values', () => {
  expect(renderToStaticMarkup(<ArtworkGallery />)).toBe('');
  const html = renderToStaticMarkup(
    <ArtworkGallery
      items={[
        { ...item, image: 'javascript:alert(1)' },
        { ...item, image: 'https://user:password@example.test/x' },
      ]}
    />
  );
  expect(html).not.toContain('<img');
  expect(html).not.toContain('password');
});
function Editor({
  initial = [item],
  onPending = vi.fn(),
  onChange = vi.fn(),
}: {
  initial?: LettinArtwork[];
  onPending?: (value: boolean) => void;
  onChange?: (items: LettinArtwork[]) => void;
}) {
  const [items, setItems] = useState(initial);
  return (
    <ArtworkGalleryEditor
      wsId="workspace"
      worldId="world"
      items={items}
      onChange={(value) => {
        setItems(value);
        onChange(value);
      }}
      onPendingChange={onPending}
    />
  );
}
async function click(text: string, index = 0) {
  await act(async () =>
    [...container.querySelectorAll('button')]
      .filter((b) => b.textContent === text)
      [index]!.click()
  );
}
async function setUrl(value: string) {
  await act(async () => {
    const input = container.querySelector('input')!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function upload() {
  await act(async () => {
    const input = container.querySelector('input[type="file"]')!;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['bytes'], 'art.png', { type: 'image/png' })],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
it('adds a gallery slot with explicit blank metadata, reorders and removes without changing other items', async () => {
  const onChange = vi.fn();
  await act(async () => root.render(<Editor onChange={onChange} />));
  await setUrl('https://example.test/b.png');
  await click('galleryAdd');
  expect(onChange).toHaveBeenLastCalledWith([
    item,
    { image: 'https://example.test/b.png', alt: '', caption: '', credit: '' },
  ]);
  await click('galleryMoveUp', 1);
  expect(onChange.mock.calls.at(-1)![0][0].image).toContain('b.png');
  await click('galleryRemove', 0);
  expect(onChange).toHaveBeenLastCalledWith([item]);
});
it('limits galleries to twelve slots', async () => {
  await act(async () => root.render(<Editor initial={Array(12).fill(item)} />));
  expect(container.querySelector('fieldset')!.disabled).toBe(true);
  expect(
    [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'galleryAdd'
    )!.disabled
  ).toBe(true);
});
it('holds upload pending state and preserves gallery on failure', async () => {
  let reject!: (error: Error) => void;
  state.mutateAsync.mockImplementation(
    () =>
      new Promise((_, r) => {
        reject = r;
      })
  );
  const onPending = vi.fn(),
    onChange = vi.fn();
  await act(async () =>
    root.render(<Editor onPending={onPending} onChange={onChange} />)
  );
  await upload();
  expect(onPending).toHaveBeenLastCalledWith(true);
  expect(container.querySelector('fieldset')!.disabled).toBe(true);
  await act(async () => reject(new Error('Upload failed')));
  expect(onPending).toHaveBeenLastCalledWith(false);
  expect(onChange).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')!.textContent).toBe(
    'requestFailed'
  );
});
it('appends the returned managed artwork without replacing saved items', async () => {
  state.mutateAsync.mockResolvedValue({
    image: '/api/v1/lettin/media/00000000-0000-4000-8000-000000000001',
  });
  const onChange = vi.fn(),
    onPending = vi.fn();
  await act(async () =>
    root.render(<Editor onChange={onChange} onPending={onPending} />)
  );
  await upload();
  expect(onChange).toHaveBeenLastCalledWith([
    item,
    expect.objectContaining({
      image: expect.stringContaining('/api/v1/lettin/media/'),
      alt: '',
    }),
  ]);
  expect(onPending).toHaveBeenLastCalledWith(false);
});
it('suppresses a deferred upload result after the editor unmounts', async () => {
  let resolve!: (value: { image: string }) => void;
  state.mutateAsync.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const onChange = vi.fn(),
    onPending = vi.fn();
  await act(async () =>
    root.render(<Editor onChange={onChange} onPending={onPending} />)
  );
  await upload();
  await act(async () => root.render(null));
  await act(async () => resolve({ image: 'https://example.test/stale.png' }));
  expect(onChange).not.toHaveBeenCalled();
  expect(onPending.mock.calls).toEqual([[true]]);
});
