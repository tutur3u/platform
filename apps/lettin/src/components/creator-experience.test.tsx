// @vitest-environment jsdom
import type { LettinOverview } from '@tuturuuu/internal-api/lettin';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import { CreatorToolkit } from './creator-toolkit';
import { createStarterDraft } from './starter-drafts';
import { WorldShelf } from './world-shelf';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) =>
    en.lettin[key as keyof typeof en.lettin] ?? key,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
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
const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);
afterEach(async () => {
  await act(() => root.unmount());
  root = createRoot(container);
});
function button(label: string) {
  const result = [...container.querySelectorAll('button')].find(
    (element) => element.textContent === label
  );
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}
it('filters the real shelf and restores it after an empty result', async () => {
  const shelf: LettinOverview['worlds'] = ['First idea', 'Second idea'].map(
    (title, index) => ({
      id: `world-${index}`,
      draft: createStarterDraft(title, 'blank', (key) => key),
      version: 1,
      published: null,
      published_at: index ? '2026-10-02' : null,
      role: 'owner',
    })
  );
  await act(() => root.render(<WorldShelf wsId="workspace" shelf={shelf} />));
  expect(container.querySelectorAll('a')).toHaveLength(2);
  await act(() => button('Published').click());
  expect(container.querySelectorAll('a')).toHaveLength(1);
  expect(container.querySelector('a')?.textContent).toContain('Second idea');
  const input = container.querySelector('input')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, 'missing');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(container.querySelectorAll('a')).toHaveLength(0);
  await act(() => button('Clear filters').click());
  expect(container.querySelectorAll('a')).toHaveLength(2);
});
it('preserves workspace and locale in toolkit links', async () => {
  await act(() => root.render(<CreatorToolkit wsId="my-workspace" />));
  const links = [...container.querySelectorAll('a')];
  const tasks = links.find((link) => link.textContent?.includes('Tasks'))!;
  expect(new URL(tasks.href).pathname).toBe('/en/my-workspace/tasks');
  expect(
    links.filter((link) =>
      new URL(link.href).pathname.includes('/en/my-workspace')
    )
  ).toHaveLength(7);
  expect(container.textContent).toContain(en.lettin.toolkitAccessNote);
});
