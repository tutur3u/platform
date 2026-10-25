// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { createElement } from 'react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

const observed: { editor: Editor | null } = { editor: null };
vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiptap/react')>();
  return {
    ...actual,
    useEditor(...args: Parameters<typeof actual.useEditor>) {
      const editor = actual.useEditor(...args);
      observed.editor = editor;
      return editor;
    },
  };
});
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { MailComposerEditor } from './mail-composer-editor';

const raw =
  '/api/v1/workspaces/ws/mail/mailboxes/box/drafts/draft/attachments/image';
beforeAll(() => {
  // JSDOM has no layout; focus scrolling is outside these URL regressions.
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  });
});
afterEach(() => {
  observed.editor?.destroy();
  observed.editor = null;
  cleanup();
  vi.unstubAllGlobals();
});
async function open(html: string, imageUrlToInsert?: string) {
  observed.editor = null;
  const changed = vi.fn<(value: { html: string; text: string }) => void>();
  const view = render(
    createElement(MailComposerEditor, {
      initialHtml: html,
      imageUrlToInsert,
      onChange: changed,
      onSelectionChange: vi.fn(),
      onEnhance: vi.fn(),
      onImageInserted: vi.fn(),
    })
  );
  const editor = await waitFor(() => {
    if (!observed.editor) throw new Error('Editor not ready');
    return observed.editor;
  });
  return { ...view, editor, changed };
}

it.each([
  ['', '/mail'],
  ['/mail', ''],
])(
  'reopens a draft saved at %j on %j without persisting the serving mount',
  async (from, to) => {
    vi.stubGlobal('__tuturuuuAppBase', from);
    const first = await open('<p>Draft</p>', `${from}${raw}`);
    await waitFor(() => expect(first.changed).toHaveBeenCalled());
    const saved = first.changed.mock.calls.at(-1)?.[0].html;
    if (!saved) throw new Error('Draft did not serialize');
    expect(saved).toContain(`src="${raw}"`);
    expect(
      first.container.querySelector('.tiptap img')?.getAttribute('src')
    ).toBe(`${from}${raw}`);
    first.editor.destroy();
    first.unmount();

    vi.stubGlobal('__tuturuuuAppBase', to);
    const reopened = await open(saved);
    expect(
      reopened.container.querySelector('.tiptap img')?.getAttribute('src')
    ).toBe(`${to}${raw}`);
    act(() =>
      reopened.editor.commands.insertContentAt(
        reopened.editor.state.doc.content.size - 1,
        'edited'
      )
    );
    expect(reopened.editor.getHTML()).toContain(`src="${raw}"`);
    expect(reopened.editor.getHTML()).not.toContain('src="/mail/api/');
  }
);
it('normalizes an already saved mounted attachment when reopened at the root', async () => {
  vi.stubGlobal('__tuturuuuAppBase', '');
  const view = await open(`<img src="/mail${raw}" alt="Logo">`);
  expect(view.editor.getHTML()).toContain(`src="${raw}"`);
  expect(view.container.querySelector('img')?.getAttribute('src')).toBe(raw);
});
it('preserves external image URLs and their accessible attributes', async () => {
  vi.stubGlobal('__tuturuuuAppBase', '/mail');
  const view = await open(
    '<img src="https://images.example/logo.png" alt="Logo" title="Sender" width="48">'
  );
  const image = view.container.querySelector('img');
  expect(image?.getAttribute('src')).toBe('https://images.example/logo.png');
  expect(image?.getAttribute('alt')).toBe('Logo');
  expect(image?.getAttribute('title')).toBe('Sender');
  expect(image?.getAttribute('width')).toBe('48');
});
