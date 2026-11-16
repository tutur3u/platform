// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useMailAttachmentCopy } from './use-mail-composer-attachment-copy';

const { copy } = vi.hoisted(() => ({ copy: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({ copyMailDraftAttachments: copy }));

beforeEach(() => {
  copy.mockReset();
});

it('leaves a late forwarded attachment copy in its original draft after reopening elsewhere', async () => {
  let finish: ((value: { attachments: [] }) => void) | undefined;
  copy.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const onCopied = vi.fn();
  const onFailed = vi.fn();
  const ensureDraft = vi.fn(async () => 'old-draft');
  const { result, rerender, unmount } = renderHook(
    (scope: { mailboxId: string; open: boolean; workspaceId: string }) =>
      useMailAttachmentCopy({ ...scope, ensureDraft, onCopied, onFailed }),
    {
      initialProps: {
        mailboxId: 'old-box',
        open: true,
        workspaceId: 'old-workspace',
      },
    }
  );
  act(() =>
    result.current.schedule({
      attachmentIds: ['file'],
      sourceMessageId: 'message',
    })
  );
  await waitFor(() =>
    expect(copy).toHaveBeenCalledWith('old-workspace', 'old-box', 'old-draft', {
      attachmentIds: ['file'],
      sourceMessageId: 'message',
    })
  );
  rerender({ mailboxId: 'old-box', open: false, workspaceId: 'old-workspace' });
  rerender({ mailboxId: 'new-box', open: true, workspaceId: 'new-workspace' });
  await act(async () => finish?.({ attachments: [] }));
  expect(onCopied).not.toHaveBeenCalled();
  expect(onFailed).not.toHaveBeenCalled();
  expect(result.current.copying).toBe(false);
  unmount();
});

it('does not copy into a new session when the original draft save finishes late', async () => {
  let saved: ((value: string) => void) | undefined;
  const ensureDraft = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        saved = resolve;
      })
  );
  const onCopied = vi.fn();
  const onFailed = vi.fn();
  const { result, rerender, unmount } = renderHook(
    ({ open }) =>
      useMailAttachmentCopy({
        mailboxId: 'box',
        workspaceId: 'workspace',
        open,
        ensureDraft,
        onCopied,
        onFailed,
      }),
    { initialProps: { open: true } }
  );
  act(() =>
    result.current.schedule({
      attachmentIds: ['file'],
      sourceMessageId: 'message',
    })
  );
  await waitFor(() => expect(ensureDraft).toHaveBeenCalledOnce());
  rerender({ open: false });
  rerender({ open: true });
  await act(async () => saved?.('old-draft'));
  expect(copy).not.toHaveBeenCalled();
  expect(onCopied).not.toHaveBeenCalled();
  expect(result.current.copying).toBe(false);
  unmount();
});

it('ignores a forwarded copy that finishes after unmount', async () => {
  let finish: ((value: { attachments: [] }) => void) | undefined;
  copy.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const onCopied = vi.fn();
  const onFailed = vi.fn();
  const { result, unmount } = renderHook(() =>
    useMailAttachmentCopy({
      ensureDraft: async () => 'draft',
      mailboxId: 'box',
      workspaceId: 'workspace',
      open: true,
      onCopied,
      onFailed,
    })
  );
  act(() =>
    result.current.schedule({
      attachmentIds: ['file'],
      sourceMessageId: 'message',
    })
  );
  await waitFor(() => expect(copy).toHaveBeenCalledOnce());
  unmount();
  await act(async () => finish?.({ attachments: [] }));
  expect(onCopied).not.toHaveBeenCalled();
  expect(onFailed).not.toHaveBeenCalled();
});
