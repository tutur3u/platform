// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import { NotebookImportReview } from './notebook-import-review';

const mocks = vi.hoisted(() => ({
  locale: 'en',
  apply: vi.fn(),
  back: vi.fn(),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const messages = mocks.locale === 'vi' ? viMessages.lettin : en.lettin;
    return (messages[key as keyof typeof messages] ?? key).replace(
      /\{(\w+)\}/g,
      (_, name) => String(values?.[name] ?? `{${name}}`)
    );
  },
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => <button {...props} />,
}));
const container = document.createElement('div'),
  root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const entries = Object.freeze(
  Array.from({ length: 45 }, (_, index) =>
    Object.freeze({
      title: `Entry ${String(index + 1).padStart(2, '0')}`,
      kind: 'page' as const,
    })
  )
);
const preview = {
  blacklistCount: 0,
  skipped: 0,
  kinds: { page: 45 },
  id: 'preview-a',
  title: 'Approved notebook',
  count: entries.length,
  entries: [...entries],
};
const original = JSON.stringify(preview);
function label(key: keyof typeof en.lettin) {
  return (mocks.locale === 'vi' ? viMessages : en).lettin[key];
}
function button(key: keyof typeof en.lettin) {
  return [...container.querySelectorAll('button')].find(
    (el) => el.textContent === label(key)
  )!;
}
async function click(key: keyof typeof en.lettin) {
  await act(async () => button(key).click());
}
async function render(
  props: Partial<ComponentProps<typeof NotebookImportReview>> = {}
) {
  await act(async () =>
    root.render(
      <NotebookImportReview
        preview={preview}
        pending={false}
        onApply={mocks.apply}
        onBack={mocks.back}
        {...props}
      />
    )
  );
}
async function search(value: string) {
  await act(async () => {
    const input = container.querySelector('input')!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.locale = 'en';
  await render();
});
afterEach(async () => {
  await act(async () => root.render(null));
  expect(JSON.stringify(preview)).toBe(original);
});
it.each(['en', 'vi'])(
  'shows bounded original-order pages and scope hints in %s',
  async (locale) => {
    mocks.locale = locale;
    await render();
    expect(container.querySelectorAll('li')).toHaveLength(20);
    expect(container.querySelector('li')?.textContent).toContain('Entry 01');
    expect(container.querySelector('[role=status]')?.textContent).toBe(
      label('importEntriesResults')
        .replace('{from}', '1')
        .replace('{to}', '20')
        .replace('{matching}', '45')
        .replace('{total}', '45')
    );
    expect(container.textContent).toContain(label('importEntriesHint'));
    expect(button('importEntriesPrevious').disabled).toBe(true);
    await click('importEntriesNext');
    expect(container.querySelector('li')?.textContent).toContain('Entry 21');
    await click('importEntriesNext');
    expect(container.querySelectorAll('li')).toHaveLength(5);
    expect(button('importEntriesNext').disabled).toBe(true);
    await click('importEntriesPrevious');
    expect(container.querySelector('li')?.textContent).toContain('Entry 21');
  }
);
it('bounds rendering for the maximum preview size', async () => {
  await render({
    preview: {
      ...preview,
      count: 1000,
      entries: Array.from({ length: 1000 }, (_, index) => ({
        title: `Title ${index}`,
        kind: 'page',
      })),
    },
  });
  expect(container.querySelectorAll('li')).toHaveLength(20);
  expect(container.querySelector('[role=status]')?.textContent).toContain(
    '1000'
  );
});
it('searches only title text and returns to page one after search changes', async () => {
  await click('importEntriesNext');
  await search('Entry 04');
  expect(container.querySelectorAll('li')).toHaveLength(1);
  expect(container.querySelector('li')?.textContent).toContain('Entry 04');
  expect(button('importEntriesPrevious').disabled).toBe(true);
  await search('page');
  expect(container.querySelectorAll('li')).toHaveLength(0);
  expect(container.textContent).toContain(label('importEntriesEmpty'));
});
it.each(['en', 'vi'])(
  'ignores case, whitespace and combining accents in %s',
  async (locale) => {
    mocks.locale = locale;
    await render({
      preview: {
        ...preview,
        count: 3,
        entries: [
          { title: 'Café guide', kind: 'page' },
          { title: 'Hồ sơ nhân vật', kind: 'character' },
          { title: 'Other', kind: 'page' },
        ],
      },
    });
    await search('  CAFE  ');
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.textContent).toContain('Café guide');
    await search('HO SO');
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.textContent).toContain('Hồ sơ nhân vật');
  }
);
it('clears search and restores the first original-order page', async () => {
  await search('Entry 45');
  await click('clearImportEntrySearch');
  expect((container.querySelector('input') as HTMLInputElement).value).toBe('');
  expect(container.querySelectorAll('li')).toHaveLength(20);
  expect(container.querySelector('li')?.textContent).toContain('Entry 01');
});
it('keeps apply unchanged even when no titles match', async () => {
  await search('No match');
  expect(container.querySelectorAll('li')).toHaveLength(0);
  expect(container.querySelector('[role=status]')?.textContent).toContain(
    'all 45 entries'
  );
  expect(button('createImport').disabled).toBe(false);
  await click('createImport');
  expect(mocks.apply).toHaveBeenCalledTimes(1);
});
it('paging does not create or select entries', async () => {
  await click('importEntriesNext');
  expect(mocks.apply).not.toHaveBeenCalled();
  await click('createImport');
  expect(mocks.apply).toHaveBeenCalledTimes(1);
});
it('resets search and page when the server preview is replaced', async () => {
  await search('Entry');
  await click('importEntriesNext');
  await render({
    preview: {
      ...preview,
      id: 'preview-b',
      entries: [{ title: 'Replacement title', kind: 'page' }],
      count: 1,
    },
  });
  expect((container.querySelector('input') as HTMLInputElement).value).toBe('');
  expect(container.querySelector('li')?.textContent).toContain(
    'Replacement title'
  );
  expect(button('importEntriesPrevious').disabled).toBe(true);
});
it('disables browsing and existing creation/back controls while pending', async () => {
  await search('Entry');
  await render({ pending: true });
  expect((container.querySelector('input') as HTMLInputElement).disabled).toBe(
    true
  );
  for (const key of [
    'importEntriesPrevious',
    'importEntriesNext',
    'clearImportEntrySearch',
    'createImport',
    'back',
  ] as const)
    expect(button(key).disabled).toBe(true);
});
it('handles an empty approved notebook without changing creation behavior', async () => {
  await render({ preview: { ...preview, entries: [], count: 0 } });
  expect(container.querySelectorAll('li')).toHaveLength(0);
  expect(button('importEntriesNext').disabled).toBe(true);
  expect(container.querySelector('[role=status]')?.textContent).toContain(
    'all 0 entries'
  );
  await click('createImport');
  expect(mocks.apply).toHaveBeenCalledTimes(1);
});
it('renders untrusted titles as text', async () => {
  await render({
    preview: {
      ...preview,
      count: 1,
      entries: [{ title: '<img src=x onerror=alert(1)>', kind: 'page' }],
    },
  });
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('li')?.textContent).toContain('<img src=x');
});
