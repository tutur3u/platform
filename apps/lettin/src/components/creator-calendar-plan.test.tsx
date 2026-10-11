// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import { CreatorCalendarPlan } from './creator-calendar-plan';

const state = vi.hoisted(() => ({ locale: 'en' as 'en' | 'vi' }));
vi.mock('next-intl', async (original) => {
  const actual = await original<typeof import('next-intl')>();
  return {
    ...actual,
    useLocale: () => state.locale,
    useTranslations: () =>
      actual.createTranslator({
        locale: state.locale,
        messages: state.locale === 'en' ? en : viMessages,
        namespace: 'lettin',
      }),
  };
});
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => <button {...props} />,
}));
vi.mock('@tuturuuu/ui/input', () => ({
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));
const container = document.createElement('div');
let root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(() => root.unmount());
  root = createRoot(container);
  state.locale = 'en';
});
async function render(disabled = false, wsId = 'personal') {
  await act(() =>
    root.render(
      <CreatorCalendarPlan key={wsId} wsId={wsId} disabled={disabled} />
    )
  );
}
async function choose(day: string) {
  await act(() => {
    const input = container.querySelector('input')!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, day);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it.each(['en', 'vi'] as const)(
  'requires explicit day choice and labels the handoff in %s',
  async (locale) => {
    state.locale = locale;
    await render();
    const messages = locale === 'en' ? en.lettin : viMessages.lettin;
    expect(container.querySelector('legend')?.textContent).toBe(
      messages.planWritingTime
    );
    expect(container.textContent).toContain(messages.planningCalendarHint);
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('button')!.disabled).toBe(true);
    await choose('2026-10-10');
    const link = container.querySelector('a')!;
    expect(link.textContent).toBe(messages.openPlanningCalendar);
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
    const url = new URL(link.href);
    expect(url.pathname).toBe(`/${locale}/personal`);
    expect([...url.searchParams]).toEqual([['date', '2026-10-10']]);
  }
);
it('blocks dirty-editor navigation without losing the selected day, and resets on workspace replacement', async () => {
  await render();
  await choose('2026-10-10');
  await render(true);
  expect(container.querySelector('input')!.disabled).toBe(true);
  expect(container.querySelector('a')).toBeNull();
  await render();
  expect(
    new URL(container.querySelector('a')!.href).searchParams.get('date')
  ).toBe('2026-10-10');
  await render(false, 'internal');
  expect(container.querySelector('input')!.value).toBe('');
  expect(container.querySelector('a')).toBeNull();
});
