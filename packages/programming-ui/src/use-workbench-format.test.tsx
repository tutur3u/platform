// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import * as Y from 'yjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../apps/meet/messages/en.json';

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast }));
const run = vi.hoisted(() => ({ format: vi.fn() }));
vi.mock('./format/formatters', () => ({
  formatSupport: (path: string | undefined) =>
    path?.endsWith('.js')
      ? {
          supported: true,
          language: 'javascript',
          formatter: { name: 'Prettier', format: run.format },
        }
      : { supported: false, reason: 'unknown' },
}));

import type { EditorSelectionHandle } from './format/selection';
import { useWorkbenchFormat } from './use-workbench-format';

const t = messages.programmingPlayground;
function setup(
  path = 'main.js',
  editable = true,
  editor?: { current: EditorSelectionHandle | null }
) {
  const doc = new Y.Doc();
  const files = doc.getMap<Y.Text>('files');
  const text = new Y.Text('let  a=1');
  files.set('main.js', text);
  files.set('notes.md', new Y.Text('#  hi'));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const hook = renderHook(
    () => useWorkbenchFormat({ doc, path, editable, editor }),
    {
      wrapper,
    }
  );
  return { doc, text, hook };
}
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it('writes the whole result back as one Yjs transaction that peers receive once', async () => {
  const { doc, text, hook } = setup();
  run.format.mockResolvedValue('let a = 1;\n');
  const updates: unknown[] = [];
  const transactions: unknown[] = [];
  doc.on('update', (_update: Uint8Array, origin: unknown) =>
    updates.push(origin)
  );
  doc.on('afterTransaction', (transaction) =>
    transactions.push(transaction.origin)
  );
  act(() => hook.result.current.format());
  await waitFor(() => expect(text.toString()).toBe('let a = 1;\n'));
  expect(updates).toEqual(['format']);
  expect(transactions).toEqual(['format']);
});

it('replaces only the differing span so peers keep their positions', async () => {
  const { text, hook } = setup();
  const anchor = Y.createRelativePositionFromTypeIndex(text, 0);
  run.format.mockResolvedValue('let  a=1;\n');
  act(() => hook.result.current.format());
  await waitFor(() => expect(text.toString()).toBe('let  a=1;\n'));
  const position = Y.createAbsolutePositionFromRelativePosition(
    anchor,
    text.doc!
  );
  expect(position?.index).toBe(0);
});

it('writes nothing if someone edited the file while the formatter ran', async () => {
  const { text, hook } = setup();
  let finish: (value: string) => void = () => undefined;
  run.format.mockReturnValue(
    new Promise<string>((resolve) => (finish = resolve))
  );
  act(() => hook.result.current.format());
  await waitFor(() => expect(hook.result.current.pending).toBe(true));
  act(() => text.insert(0, '// hi\n'));
  finish('let a = 1;\n');
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(t.formatChanged)
  );
  expect(text.toString()).toBe('// hi\nlet  a=1');
});

it('says so when the file is already formatted and leaves it alone', async () => {
  const { text, hook } = setup();
  run.format.mockResolvedValue('let  a=1');
  act(() => hook.result.current.format());
  await waitFor(() => expect(toast).toHaveBeenCalledWith(t.formatAlready));
  expect(text.toString()).toBe('let  a=1');
});

it('reports a formatter failure by name, and a load failure apart', async () => {
  const { hook } = setup();
  run.format.mockRejectedValueOnce(new Error('Unexpected token'));
  act(() => hook.result.current.format());
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      t.formatFailed.replace('{name}', 'Prettier')
    )
  );
  run.format.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  act(() => hook.result.current.format());
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(t.formatLoadFailed)
  );
});

it('does nothing for a file without a formatter or for someone who cannot edit', () => {
  const unsupported = setup('notes.md');
  expect(unsupported.hook.result.current.support.supported).toBe(false);
  act(() => unsupported.hook.result.current.format());
  const readOnly = setup('main.js', false);
  act(() => readOnly.hook.result.current.format());
  expect(run.format).not.toHaveBeenCalled();
});

it('puts the caret back on the same text after the file is rewritten', async () => {
  const handle = {
    getSelection: vi.fn(() => ({ anchor: 8, head: 8 })),
    setSelection: vi.fn(),
  };
  const { text, hook } = setup('main.js', true, { current: handle });
  // 'let  a=1' is 8 characters: the caret sits at the end of line 1.
  run.format.mockResolvedValue('let a = 1;');
  act(() => hook.result.current.format());
  await waitFor(() => expect(handle.setSelection).toHaveBeenCalledTimes(1));
  const [selection, expected] = handle.setSelection.mock.calls[0]!;
  expect(expected).toBe('let a = 1;');
  expect(text.toString()).toBe(expected);
  expect(selection.anchor).toBeLessThanOrEqual(expected.length);
});

it('keeps a caret that follows the changed span, with the editor told what to expect', async () => {
  const handle = {
    getSelection: vi.fn(() => ({
      anchor: 'let  a=1\n'.length + 4,
      head: 'let  a=1\n'.length + 4,
    })),
    setSelection: vi.fn(),
  };
  const doc = new Y.Doc();
  const text = new Y.Text('let  a=1\nfoo()');
  doc.getMap<Y.Text>('files').set('main.js', text);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const { result } = renderHook(
    () =>
      useWorkbenchFormat({
        doc,
        path: 'main.js',
        editable: true,
        editor: { current: handle },
      }),
    { wrapper }
  );
  run.format.mockResolvedValue('let a = 1;\nfoo()');
  act(() => result.current.format());
  await waitFor(() => expect(handle.setSelection).toHaveBeenCalled());
  const [selection] = handle.setSelection.mock.calls[0]!;
  // The caret was 4 characters into "foo()" after the first line, and still is.
  expect(text.toString().slice(0, selection.head)).toBe('let a = 1;\nfoo(');
});

it('formats without an editor to restore', async () => {
  const { text, hook } = setup('main.js', true, { current: null });
  run.format.mockResolvedValue('let a = 1;');
  act(() => hook.result.current.format());
  await waitFor(() => expect(text.toString()).toBe('let a = 1;'));
});
