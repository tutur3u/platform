// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vietnamese from '../../messages/vi.json';
import { ReaderPresentation } from './reader-presentation';

const language = vi.hoisted(() => ({ value: 'en' }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    (language.value === 'vi' ? vietnamese : en).lettin[
      key as keyof typeof en.lettin
    ],
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ComponentProps<'button'> & { variant?: string }) => <button {...props} />,
}));
let dispose = () => {};
afterEach(() => {
  dispose();
  language.value = 'en';
});
async function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = async (
    text = 'Published body',
    active = true,
    key = 'notebook'
  ) =>
    act(async () =>
      root.render(
        <ReaderPresentation key={key} active={active}>
          <article className="lettin-prose">
            <h1>Published title</h1>
            <p>{text}</p>
          </article>
        </ReaderPresentation>
      )
    );
  dispose = () => {
    act(() => root.unmount());
  };
  await render();
  return { container, render };
}
async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
it.each([
  ['en', en],
  ['vi', vietnamese],
] as const)(
  'renders the real %s controls with unchanged defaults and reader-local guidance',
  async (locale, messages) => {
    language.value = locale;
    const { container } = await mount();
    for (const key of [
      'readerPresentation',
      'readerPresentationHint',
      'readerTextSize',
      'readerSizeDefault',
      'readerSizeLarge',
      'readerSizeLargest',
      'readerLineSpacing',
      'readerSpacingRelaxed',
      'readerResetPresentation',
    ] as const)
      expect(container.textContent).toContain(messages.lettin[key]);
    expect(
      container
        .querySelector('.lettin-reader-presentation')
        ?.getAttribute('data-reader-size')
    ).toBe('default');
    expect(container.querySelector('button')?.disabled).toBe(true);
    expect(container.querySelector('article p')?.textContent).toBe(
      'Published body'
    );
  }
);
it('keeps size and spacing choices independent and resets both without changing content', async () => {
  const { container } = await mount();
  const [size, spacing] = container.querySelectorAll('select');
  await choose(size!, 'largest');
  await choose(spacing!, 'relaxed');
  const presentation = container.querySelector('.lettin-reader-presentation')!;
  expect(presentation.getAttribute('data-reader-size')).toBe('largest');
  expect(presentation.getAttribute('data-reader-spacing')).toBe('relaxed');
  await choose(size!, 'large');
  expect(presentation.getAttribute('data-reader-spacing')).toBe('relaxed');
  await act(async () => container.querySelector('button')!.click());
  expect(presentation.getAttribute('data-reader-size')).toBe('default');
  expect(presentation.getAttribute('data-reader-spacing')).toBe('default');
  expect(container.querySelector('article')?.textContent).toBe(
    'Published titlePublished body'
  );
});
it('retains choices across entry changes, pauses them in browsing, and resets on a notebook remount', async () => {
  const { container, render } = await mount();
  await choose(container.querySelectorAll('select')[0]!, 'large');
  await choose(container.querySelectorAll('select')[1]!, 'relaxed');
  await render('Second published entry');
  expect(container.querySelector('select')?.value).toBe('large');
  expect(container.querySelector('article p')?.textContent).toBe(
    'Second published entry'
  );
  await render('Browse results', false);
  expect(container.querySelector('fieldset')).toBeNull();
  expect(
    container
      .querySelector('.lettin-reader-presentation')
      ?.getAttribute('data-reader-size')
  ).toBe('default');
  await render('Published body', true);
  expect(container.querySelectorAll('select')[0]?.value).toBe('large');
  expect(container.querySelectorAll('select')[1]?.value).toBe('relaxed');
  await render('Other notebook', true, 'other-notebook');
  expect(container.querySelectorAll('select')[0]?.value).toBe('default');
  expect(container.querySelectorAll('select')[1]?.value).toBe('default');
});
it('normalizes an unsupported programmatic option to the default presentation', async () => {
  const { container } = await mount();
  await choose(container.querySelector('select')!, 'largest');
  await choose(container.querySelector('select')!, 'unsupported');
  expect(
    container
      .querySelector('.lettin-reader-presentation')
      ?.getAttribute('data-reader-size')
  ).toBe('default');
});
