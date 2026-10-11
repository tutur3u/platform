// @vitest-environment jsdom
import type { LettinDraft } from '@tuturuuu/internal-api/lettin';
import {
  act,
  type ComponentProps,
  cloneElement,
  createContext,
  type ReactElement,
  useContext,
} from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import viMessages from '../../messages/vi.json';
import { PublishedDraftRestore } from './published-draft-restore';
import { createStarterDraft } from './starter-drafts';

const state = vi.hoisted(() => ({ locale: 'en' as 'en' | 'vi' }));
vi.mock('next-intl', async (original) => {
  const actual = await original<typeof import('next-intl')>();
  return {
    ...actual,
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
vi.mock('@tuturuuu/ui/dialog', () => {
  const Context = createContext({
    open: false,
    onOpenChange: (_value: boolean) => {},
  });
  const Container = ({ children }: ComponentProps<'div'>) => (
    <div>{children}</div>
  );
  return {
    Dialog: ({
      children,
      open,
      onOpenChange,
    }: {
      children: ReactElement[];
      open: boolean;
      onOpenChange: (value: boolean) => void;
    }) => (
      <Context.Provider value={{ open, onOpenChange }}>
        {children}
      </Context.Provider>
    ),
    DialogTrigger: ({
      children,
    }: {
      children: ReactElement<ComponentProps<'button'>>;
    }) => {
      const { onOpenChange } = useContext(Context);
      return cloneElement(children, { onClick: () => onOpenChange(true) });
    },
    DialogContent: ({ children }: ComponentProps<'div'>) =>
      useContext(Context).open ? <div role="dialog">{children}</div> : null,
    DialogHeader: Container,
    DialogTitle: Container,
    DialogDescription: Container,
  };
});
const published = {
  ...createStarterDraft('Public version', 'blank', (key) => key),
  tags: ['visible'],
  creationGuidance: {
    credits: 'Artist',
    usageNotes: 'Ask first',
    collaboration: 'ask-first' as const,
  },
};
const container = document.createElement('div');
let root = createRoot(container);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(async () => {
  await act(() => root.unmount());
  root = createRoot(container);
  state.locale = 'en';
});
async function render(
  onRestore = vi.fn(),
  disabled = false,
  value: LettinDraft | null = published
) {
  await act(() =>
    root.render(
      <PublishedDraftRestore
        published={value}
        disabled={disabled}
        onRestore={onRestore}
      />
    )
  );
  return onRestore;
}
async function click(text: string) {
  await act(() =>
    [...container.querySelectorAll('button')]
      .find((b) => b.textContent === text)!
      .click()
  );
}
it.each(['en', 'vi'] as const)(
  'requires translated explicit confirmation in %s and clones the authored snapshot',
  async (locale) => {
    state.locale = locale;
    const m = locale === 'en' ? en.lettin : viMessages.lettin;
    const onRestore = await render();
    expect(container.querySelector('[role=dialog]')).toBeNull();
    await click(m.restorePublishedDraft);
    expect(onRestore).not.toHaveBeenCalled();
    expect(container.textContent).toContain(m.restorePublishedDraftHint);
    await click(m.stagePublishedDraft);
    expect(onRestore).toHaveBeenCalledOnce();
    const result = onRestore.mock.calls[0]![0];
    expect(result).toEqual(published);
    expect(result).not.toBe(published);
    result.tags.push('local');
    expect(published.tags).toEqual(['visible']);
    expect(result.creationGuidance).toEqual(published.creationGuidance);
    expect(container.querySelector('[role=dialog]')).toBeNull();
  }
);
it('cancels without staging and disables capture when no current public snapshot exists', async () => {
  const onRestore = await render();
  await click(en.lettin.restorePublishedDraft);
  await click(en.lettin.cancel);
  expect(onRestore).not.toHaveBeenCalled();
  await render(onRestore, false, null);
  expect(container.querySelector('button')!.disabled).toBe(true);
  expect(container.querySelector('[role=dialog]')).toBeNull();
});
it.each(['busy', 'unpublished'])(
  'blocks confirmation if the source becomes %s while the dialog is open',
  async (reason) => {
    const onRestore = await render();
    await click(en.lettin.restorePublishedDraft);
    await render(
      onRestore,
      reason === 'busy',
      reason === 'unpublished' ? null : published
    );
    await click(en.lettin.stagePublishedDraft);
    expect(onRestore).not.toHaveBeenCalled();
  }
);
