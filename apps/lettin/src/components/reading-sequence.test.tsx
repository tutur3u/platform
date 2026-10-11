// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import { ReadingSequence } from './reading-sequence';

let locale: 'en' | 'vi' = 'en';
vi.mock('next-intl', () => ({
  useTranslations: () => (key: keyof typeof en.lettin) =>
    (locale === 'vi' ? viMessages : en).lettin[key],
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => <button {...props} />,
}));
const entries = [
  { id: 'one', title: 'First' },
  { id: 'two', title: '<script>Second</script>' },
  { id: 'three', title: 'Third' },
];

it.each(['en', 'vi'] as const)(
  'navigates both neighbors with localized labels and escaped titles (%s)',
  async (language) => {
    locale = language;
    const host = document.createElement('div');
    const root = createRoot(host);
    const onSelect = vi.fn();
    try {
      await act(() =>
        root.render(
          <ReadingSequence
            entries={entries}
            selected="two"
            onSelect={onSelect}
          />
        )
      );
      const messages = language === 'vi' ? viMessages.lettin : en.lettin;
      expect(host.querySelector('nav')?.getAttribute('aria-label')).toBe(
        messages.readingSequence
      );
      const buttons = [...host.querySelectorAll('button')];
      expect(buttons[0]?.textContent).toContain(messages.previousReadingEntry);
      expect(buttons[1]?.textContent).toContain(messages.nextReadingEntry);
      await act(() => buttons[0]!.click());
      await act(() => buttons[1]!.click());
      expect(onSelect.mock.calls).toEqual([['one'], ['three']]);
      await act(() =>
        root.render(
          <ReadingSequence
            entries={entries}
            selected="one"
            onSelect={onSelect}
          />
        )
      );
      expect(host.textContent).toContain('<script>Second</script>');
      expect(host.querySelector('script')).toBeNull();
    } finally {
      await act(() => root.unmount());
    }
  }
);

it.each(['one', 'three'])(
  'stops at the list boundary without wrapping (%s)',
  async (selected) => {
    locale = 'en';
    const host = document.createElement('div');
    const root = createRoot(host);
    const onSelect = vi.fn();
    try {
      await act(() =>
        root.render(
          <ReadingSequence
            entries={entries}
            selected={selected}
            onSelect={onSelect}
          />
        )
      );
      const buttons = [...host.querySelectorAll('button')];
      const boundary = buttons[selected === 'one' ? 0 : 1]!;
      expect(boundary.disabled).toBe(true);
      await act(() => boundary.click());
      expect(onSelect).not.toHaveBeenCalled();
    } finally {
      await act(() => root.unmount());
    }
  }
);

it('removes stale neighbors when filtering excludes the selection or leaves one result', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const onSelect = vi.fn();
  try {
    await act(() =>
      root.render(
        <ReadingSequence entries={entries} selected="two" onSelect={onSelect} />
      )
    );
    expect(host.querySelectorAll('button')).toHaveLength(2);
    for (const filtered of [[], [entries[0]!], [entries[0]!, entries[2]!]]) {
      await act(() =>
        root.render(
          <ReadingSequence
            entries={filtered}
            selected="two"
            onSelect={onSelect}
          />
        )
      );
      expect(host.querySelector('nav')).toBeNull();
    }
    await act(() =>
      root.render(
        <ReadingSequence
          entries={[entries[1]!]}
          selected="two"
          onSelect={onSelect}
        />
      )
    );
    expect(host.querySelector('nav')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  } finally {
    await act(() => root.unmount());
  }
});
