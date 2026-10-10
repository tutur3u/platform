// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import vietnamese from '../../messages/vi.json';
import { DocumentView } from './document-view';
import { ReaderPresentation } from './reader-presentation';
import { createStarterDraft } from './starter-drafts';

const notebookCss = readFileSync(
  resolve(process.cwd(), 'src/app/[locale]/notebook.css'),
  'utf8'
);

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

it('keeps a private DocumentView preview outside the reader controls and wrapper', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  const root = createRoot(host);
  const draft = createStarterDraft('Private notebook', 'blank', (key) => key);
  const original = JSON.stringify(draft);
  try {
    await act(() => root.render(<DocumentView draft={draft} />));
    expect(host.querySelector('article')).not.toBeNull();
    expect(host.querySelector('.lettin-reader-presentation')).toBeNull();
    expect(host.querySelector('fieldset')).toBeNull();
    expect(host.querySelector('select')).toBeNull();
    expect(JSON.stringify(draft)).toBe(original);
  } finally {
    await act(() => root.unmount());
  }
});

// CSSOM parses the shipped stylesheet; this checks its cascade, not page geometry.
function winningDeclaration(
  rules: CSSStyleRule[],
  element: Element,
  property: string
) {
  const applicable = rules.flatMap((rule, order) => {
    const value = rule.style.getPropertyValue(property);
    if (!value) return [];
    return rule.selectorText.split(',').flatMap((selector) => {
      if (!element.matches(selector)) return [];
      // Relevant prose rules use only classes, attributes and descendants.
      // Reject unsupported selector syntax rather than guessing specificity.
      const simple = selector.match(/\.[\w-]+|\[[^\]]+\]/g) ?? [];
      expect(selector.replace(/\.[\w-]+|\[[^\]]+\]/g, '').trim()).toBe('');
      expect(rule.style.getPropertyPriority(property)).toBe('');
      return [{ value, specificity: simple.length, order }];
    });
  });
  applicable.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
  expect(applicable.length).toBeGreaterThan(0);
  return applicable.at(-1)!.value;
}

it.each([
  ['default', 'default', '1.03rem', '1.8'],
  ['default', 'relaxed', '1.03rem', '2.1'],
  ['large', 'default', '1.2rem', '1.8'],
  ['large', 'relaxed', '1.2rem', '2.1'],
  ['largest', 'default', '1.4rem', '1.8'],
  ['largest', 'relaxed', '1.4rem', '2.1'],
])(
  'prints default prose metrics for %s size and %s spacing while preserving screen choices',
  async (size, spacing, screenSize, screenSpacing) => {
    const style = document.createElement('style');
    style.textContent = notebookCss;
    document.head.append(style);
    try {
      const rules = Array.from(style.sheet!.cssRules);
      const screen = rules.filter(
        (rule): rule is CSSStyleRule => rule.type === CSSRule.STYLE_RULE
      );
      const print = rules.flatMap((rule) => {
        if (rule.type === CSSRule.STYLE_RULE) return [rule as CSSStyleRule];
        if (rule.type !== CSSRule.MEDIA_RULE) return [];
        const media = rule as CSSMediaRule;
        return media.conditionText === 'print'
          ? Array.from(media.cssRules).map((item) => item as CSSStyleRule)
          : [];
      });
      const { container } = await mount();
      const selects = container.querySelectorAll('select');
      await choose(selects[0]!, size!);
      await choose(selects[1]!, spacing!);
      const prose = container.querySelector('article')!;
      expect(winningDeclaration(screen, prose, 'font-size')).toBe(screenSize);
      expect(winningDeclaration(screen, prose, 'line-height')).toBe(
        screenSpacing
      );
      const defaults = screen.find(
        (rule) => rule.selectorText === '.lettin-prose'
      )!;
      for (const property of ['font-size', 'line-height']) {
        expect(winningDeclaration(print, prose, property)).toBe(
          defaults.style.getPropertyValue(property)
        );
      }
      expect(
        winningDeclaration(
          print,
          container.querySelector('.lettin-reader-controls')!,
          'display'
        )
      ).toBe('none');
      expect(selects[0]!.value).toBe(size);
      expect(selects[1]!.value).toBe(spacing);
    } finally {
      style.remove();
    }
  }
);
