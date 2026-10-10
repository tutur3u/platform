// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { WritingGoal } from './writing-goal';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
for (const [locale, messages] of [
  ['en', en],
  ['vi', vi],
] as const) {
  it(`tracks explicit session goals, retains targets through pending content, and resets on source remount (${locale})`, async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const render = (words: number, incomplete = false, key = 'first') => (
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="UTC"
      >
        <WritingGoal key={key} words={words} incomplete={incomplete} />
      </NextIntlClientProvider>
    );
    const input = async (value: string) => {
      const field = host.querySelector('input')!;
      await act(() => {
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    try {
      await act(() => root.render(render(3)));
      expect(host.querySelector('input')?.value).toBe('');
      expect(host.querySelector('progress, button')).toBeNull();
      expect(host.textContent).toContain(messages.lettin.writingGoalHint);
      await input('5');
      expect(host.querySelector('progress')?.value).toBe(3);
      expect(host.querySelector('progress')?.max).toBe(5);
      expect(host.textContent).not.toContain(
        messages.lettin.writingGoalReached
      );
      await act(() => root.render(render(7)));
      expect(host.querySelector('progress')?.value).toBe(5);
      expect(host.textContent).toContain(messages.lettin.writingGoalReached);
      await act(() => root.render(render(7, true)));
      expect(host.querySelector('input')?.value).toBe('5');
      expect(host.querySelector('progress')).toBeNull();
      expect(host.textContent).not.toContain(
        messages.lettin.writingGoalReached
      );
      expect(host.textContent).toContain(
        messages.lettin.writingGoalUnavailable
      );
      await act(() => root.render(render(4)));
      expect(host.querySelector('progress')?.value).toBe(4);
      await act(() => host.querySelector<HTMLButtonElement>('button')!.click());
      expect(host.querySelector('input')?.value).toBe('');
      expect(host.querySelector('progress, button')).toBeNull();
      await input('10');
      await act(() => root.render(render(4, false, 'second')));
      expect(host.querySelector('input')?.value).toBe('');
      expect(host.querySelector('progress')).toBeNull();
    } finally {
      await act(() => root.unmount());
    }
  });
}

it('validates finite bounded whole-number targets without silently clamping input', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(() =>
      root.render(
        <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
          <WritingGoal words={0} incomplete={false} />
        </NextIntlClientProvider>
      )
    );
    const field = host.querySelector('input')!;
    for (const value of ['0', '-1', '1.5', '1e3', '100001', 'Infinity']) {
      await act(() => {
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(field.value).toBe(value);
      expect(field.getAttribute('aria-invalid')).toBe('true');
      expect(host.querySelector('[role="alert"]')?.textContent).toBe(
        en.lettin.writingGoalInvalid
      );
      expect(host.querySelector('progress')).toBeNull();
    }
    for (const value of ['1', '100000']) {
      await act(() => {
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(field.getAttribute('aria-invalid')).toBe('false');
      expect(host.querySelector('progress')?.max).toBe(Number(value));
      expect(host.querySelector('[role="alert"]')).toBeNull();
    }
    await act(() => {
      field.value = '';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(field.getAttribute('aria-invalid')).toBe('false');
    expect(host.querySelector('progress, [role="alert"]')).toBeNull();
  } finally {
    await act(() => root.unmount());
  }
});
