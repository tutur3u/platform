import { describe, expect, it } from 'vitest';
import {
  attachment,
  flush,
  OWNER,
  pdf,
  png,
  setup,
} from './mail-composer-upload-store.fixtures';
import {
  type MailMediaItem,
  summarizeMedia,
  visibleMediaChips,
} from './mail-composer-upload-state';

describe('immediate placeholders', () => {
  it('queues every file at once and uploads them one at a time', async () => {
    const t = setup();
    t.store.addFiles([png('a.png'), png('b.png'), pdf('c.pdf')], true);
    // Synchronously: all placeholders exist; the first has started.
    expect(t.fake.calls.filter((call) => call.startsWith('insert'))).toEqual([
      'insert:id1:queued',
      'insert:id2:queued',
    ]);
    expect(t.statuses()).toEqual(['uploading', 'queued', 'queued']);
    await flush();
    expect(t.uploads).toHaveLength(1);
    t.uploads[0]?.succeed();
    await flush();
    expect(t.statuses()).toEqual(['uploaded', 'uploading', 'queued']);
    expect(t.uploads).toHaveLength(2);
  });

  it('treats non-images and plain attachments as chips without editor nodes', () => {
    const t = setup();
    t.store.addFiles([pdf('c.pdf')], true);
    t.store.addFiles([png('d.png')], false);
    expect(t.fake.calls.filter((call) => call.startsWith('insert'))).toEqual(
      []
    );
    expect(t.deps.createObjectUrl).toHaveBeenCalledTimes(0);
    expect(t.store.getSnapshot().items.map((item) => item.kind)).toEqual([
      'attachment',
      'attachment',
    ]);
  });

  it('falls back to a chip when no editor is mounted', () => {
    const t = setup({ editor: false });
    t.store.addFiles([png('a.png')], true);
    expect(t.store.getSnapshot().items[0]?.kind).toBe('attachment');
    expect(t.deps.revokeObjectUrl).toHaveBeenCalledWith('blob:a.png');
  });

  it('reserves the decoded local size', async () => {
    const t = setup();
    t.store.addFiles([png('a.png')], true);
    await flush();
    expect(t.fake.calls).toContain('size:id1:640x480');
  });
});

describe('replace by id after decode', () => {
  it('cleans a keyboard-deleted failed preview and retains a retry chip on delete failure', async () => {
    const t = setup();
    t.store.addFiles([png('a.png')], true);
    await flush();
    t.deps.decodeImage.mockResolvedValueOnce(null);
    t.uploads[0]?.succeed();
    await flush();
    t.deps.remove.mockRejectedValueOnce(new Error('offline'));
    t.fake.nodes.remove('id1');
    t.store.reconcileNodes();
    await flush();
    expect(t.deps.remove).toHaveBeenCalledExactlyOnceWith(OWNER, 'att1');
    expect(t.find('id1')?.status).toBe('failed');
    expect(t.find('id1')?.kind).toBe('attachment');
    expect(visibleMediaChips(t.store.getSnapshot().items, '')).toHaveLength(1);
    t.store.remove('id1');
    await flush();
    expect(t.find('id1')).toBeUndefined();
  });

  it('restores a failed queued-removal as retryable after the upload pump has stopped', async () => {
    const t = setup();
    t.store.addFiles([png('a.png')], true);
    await flush();
    t.deps.decodeImage.mockResolvedValueOnce(null);
    t.uploads[0]?.succeed();
    await flush();
    t.store.addFiles([pdf('b.pdf')], false);
    await flush();
    t.store.retry('id1');
    let reject: ((error: Error) => void) | undefined;
    t.deps.remove.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        })
    );
    t.store.remove('id1');
    t.uploads[1]?.succeed();
    await flush();
    reject?.(new Error('offline'));
    await flush();
    expect(t.find('id1')?.status).toBe('failed');
    t.store.retry('id1');
    await flush();
    expect(t.find('id1')?.status).toBe('uploaded');
    expect(t.uploads).toHaveLength(2);
  });

  it('deletes a known attachment when its decode retry is queued behind another upload', async () => {
    const t = setup();
    t.store.addFiles([png('a.png')], true);
    await flush();
    t.deps.decodeImage.mockResolvedValueOnce(null);
    t.uploads[0]?.succeed();
    await flush();
    t.store.addFiles([pdf('b.pdf')], false);
    await flush();
    t.store.retry('id1');
    expect(t.find('id1')?.status).toBe('queued');
    t.store.remove('id1');
    await flush();
    expect(t.deps.remove).toHaveBeenCalledExactlyOnceWith(OWNER, 'att1');
    expect(t.find('id1')).toBeUndefined();
    expect(t.uploads).toHaveLength(2);
  });

  it('keeps a failed server decode preview and retries the same attachment', async () => {
    const t = setup();
    t.store.addFiles([png('a.png')], true);
    await flush();
    t.deps.decodeImage.mockResolvedValueOnce(null);
    t.uploads[0]?.succeed();
    await flush();
    expect(t.statuses()).toEqual(['failed']);
    expect(t.find('id1')?.attachment?.id).toBe('att1');
    expect(t.find('id1')?.previewUrl).toBe('blob:a.png');
    expect(t.fake.calls.some((call) => call.startsWith('resolve'))).toBe(false);
    expect(t.deps.revokeObjectUrl).not.toHaveBeenCalled();
    t.store.retry('id1');
    await flush();
    expect(t.statuses()).toEqual(['uploaded']);
    expect(t.uploads).toHaveLength(1);
    expect(t.find('id1')?.attachment?.id).toBe('att1');
    expect(t.deps.revokeObjectUrl).toHaveBeenCalledExactlyOnceWith(
      'blob:a.png'
    );
  });

  it.each(['remove', 'close'] as const)(
    'cleans up the known upload after decode failure on %s',
    async (action) => {
      const t = setup();
      t.store.addFiles([png('a.png')], true);
      await flush();
      t.deps.decodeImage.mockResolvedValueOnce(null);
      t.uploads[0]?.succeed();
      await flush();
      if (action === 'remove') t.store.remove('id1');
      else t.store.cancelAll();
      await flush();
      expect(t.deps.remove).toHaveBeenCalledExactlyOnceWith(OWNER, 'att1');
      expect(t.store.getSnapshot().items).toEqual([]);
      expect(t.deps.revokeObjectUrl).toHaveBeenCalledExactlyOnceWith(
        'blob:a.png'
      );
    }
  );

  it('swaps the same node only once the server image has decoded', async () => {
    const t = setup();
    t.holdDecode.enabled = true;
    t.store.addFiles([png('a.png')], true);
    await flush();
    t.uploads[0]?.succeed();
    await flush();
    expect(t.statuses()).toEqual(['uploading']);
    expect(t.fake.calls.some((call) => call.startsWith('resolve'))).toBe(false);
    t.decode();
    await flush();
    expect(t.fake.calls).toContain(
      'resolve:id1:/api/v1/workspaces/ws/mail/mailboxes/box/drafts/draft/attachments/att1'
    );
    const item = t.find('id1');
    expect(item?.status).toBe('uploaded');
    expect(item?.attachment?.id).toBe('att1');
    // The preview is released only after the swap.
    expect(t.deps.revokeObjectUrl).toHaveBeenCalledExactlyOnceWith(
      'blob:a.png'
    );
    // The upload used an inline content id and never a blob in the body.
    expect(t.uploads[0]?.input.contentId).toMatch(/@tuturuuu\.mail$/u);
  });

  it('keeps the item id stable while the server id differs', async () => {
    const t = setup();
    t.store.addFiles([png('a.png')], true);
    await flush();
    t.uploads[0]?.succeed();
    await flush();
    expect(t.find('id1')?.attachment?.id).toBe('att1');
    expect(t.find('att1')).toBeUndefined();
  });
});

describe('failure and retry', () => {
  it('marks the item failed in place and retries it behind the queue', async () => {
    const t = setup();
    t.store.addFiles([png('a.png'), png('b.png')], true);
    await flush();
    t.uploads[0]?.fail();
    await flush();
    expect(t.statuses()).toEqual(['failed', 'uploading']);
    expect(t.fake.calls).toContain('state:id1:failed');
    t.store.retry('id1');
    expect(t.statuses()).toEqual(['queued', 'uploading']);
    t.uploads[1]?.succeed();
    await flush();
    // b finished first; the retried item now runs.
    expect(t.statuses()).toEqual(['uploading', 'uploaded']);
    expect(t.uploads).toHaveLength(3);
    t.uploads[2]?.succeed();
    await flush();
    expect(t.statuses()).toEqual(['uploaded', 'uploaded']);
  });

  it('fails the item when the draft cannot be saved, without uploading', async () => {
    const t = setup();
    t.deps.ensureDraft.mockResolvedValueOnce(null);
    t.store.addFiles([pdf('c.pdf')], false);
    await flush();
    expect(t.statuses()).toEqual(['failed']);
    expect(t.deps.upload).not.toHaveBeenCalled();
  });

  it('ignores retry for an item that is not failed', async () => {
    const t = setup();
    t.store.addFiles([pdf('c.pdf')], false);
    await flush();
    t.store.retry('id1');
    expect(t.statuses()).toEqual(['uploading']);
    expect(t.uploads).toHaveLength(1);
  });
});

describe('removal races', () => {
  it('cancels an upload in flight and never resurrects it', async () => {
    const t = setup();
    t.store.addFiles([png('a.png')], true);
    await flush();
    t.store.remove('id1');
    expect(t.store.getSnapshot().items).toEqual([]);
    expect(t.fake.calls).toContain('remove:id1');
    expect(t.uploads[0]?.input.signal.aborted).toBe(true);
    await flush();
    expect(t.fake.calls.some((call) => call.startsWith('resolve'))).toBe(false);
    expect(t.deps.remove).not.toHaveBeenCalled();
    expect(t.deps.revokeObjectUrl).toHaveBeenCalledExactlyOnceWith(
      'blob:a.png'
    );
  });

  it('deletes only the known attachment when a cancelled upload still succeeds', async () => {
    const t = setup({ honorAbort: false });
    t.store.addFiles([png('a.png')], true);
    await flush();
    t.store.remove('id1');
    t.uploads[0]?.succeed();
    await flush();
    expect(t.store.getSnapshot().items).toEqual([]);
    expect(t.fake.calls.some((call) => call.startsWith('resolve'))).toBe(false);
    expect(t.deps.remove).toHaveBeenCalledExactlyOnceWith(OWNER, 'att1');
  });

  it('never deletes anything for a failed upload whose outcome is unknown', async () => {
    const t = setup();
    t.store.addFiles([pdf('c.pdf')], false);
    await flush();
    t.uploads[0]?.fail();
    await flush();
    t.store.remove('id1');
    expect(t.store.getSnapshot().items).toEqual([]);
    expect(t.deps.remove).not.toHaveBeenCalled();
  });

  it('drops a queued item without any request', async () => {
    const t = setup();
    t.store.addFiles([pdf('a.pdf'), pdf('b.pdf')], false);
    await flush();
    t.store.remove('id2');
    t.uploads[0]?.succeed();
    await flush();
    expect(t.deps.upload).toHaveBeenCalledTimes(1);
    expect(t.statuses()).toEqual(['uploaded']);
  });

  it('cancels a placeholder whose node the user deleted', async () => {
    const t = setup();
    t.store.addFiles([png('a.png')], true);
    await flush();
    t.fake.ids.delete('id1');
    t.store.reconcileNodes();
    expect(t.store.getSnapshot().items).toEqual([]);
    expect(t.uploads[0]?.input.signal.aborted).toBe(true);
  });

  it('leaves uploaded and unrelated items alone during reconcile', async () => {
    const t = setup();
    t.store.reset([attachment('att0', 'inline')], OWNER);
    t.store.reconcileNodes();
    expect(t.statuses()).toEqual(['uploaded']);
  });
});

describe('optimistic removal of uploaded items', () => {
  it('hides the item at once and drops it when the delete succeeds', async () => {
    const t = setup();
    t.store.reset(
      [attachment('a', 'attachment'), attachment('b', 'attachment')],
      OWNER
    );
    t.store.remove('a');
    expect(t.statuses()).toEqual(['removing', 'uploaded']);
    expect(
      visibleMediaChips(t.store.getSnapshot().items, '').map((i) => i.id)
    ).toEqual(['b']);
    expect(t.deps.remove).toHaveBeenCalledExactlyOnceWith(OWNER, 'a');
    await flush();
    expect(t.store.getSnapshot().items.map((item) => item.id)).toEqual(['b']);
  });

  it('rolls back to the same index and offers Try again when the delete fails', async () => {
    const t = setup();
    t.store.reset(
      [
        attachment('a', 'attachment'),
        attachment('b', 'attachment'),
        attachment('c', 'attachment'),
      ],
      OWNER
    );
    t.deps.remove.mockRejectedValueOnce(new Error('offline'));
    t.store.remove('b');
    await flush();
    expect(t.store.getSnapshot().items.map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(t.statuses()).toEqual(['uploaded', 'uploaded', 'uploaded']);
    expect(t.deps.onRemoveFailed).toHaveBeenCalledTimes(1);
    const [failed, retry] = t.deps.onRemoveFailed.mock.calls[0] as [
      MailMediaItem,
      () => void,
    ];
    expect(failed.id).toBe('b');
    retry();
    await flush();
    expect(t.deps.remove).toHaveBeenCalledTimes(2);
    expect(t.store.getSnapshot().items.map((item) => item.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('treats a missing server object as already removed', async () => {
    const t = setup();
    t.store.reset([attachment('a', 'attachment')], OWNER);
    t.deps.remove.mockRejectedValueOnce(
      Object.assign(new Error('gone'), { status: 404 })
    );
    t.store.remove('a');
    await flush();
    expect(t.store.getSnapshot().items).toEqual([]);
    expect(t.deps.onRemoveFailed).not.toHaveBeenCalled();
  });

  it('ignores a second removal while one is pending', async () => {
    const t = setup();
    t.store.reset([attachment('a', 'attachment')], OWNER);
    t.store.remove('a');
    t.store.remove('a');
    expect(t.deps.remove).toHaveBeenCalledTimes(1);
  });
});

describe('cancel and cleanup', () => {
  it('aborts requests, revokes every preview and drops all items', async () => {
    const t = setup();
    t.store.addFiles([png('a.png'), png('b.png')], true);
    await flush();
    t.store.cancelAll();
    expect(t.store.getSnapshot().items).toEqual([]);
    expect(t.uploads[0]?.input.signal.aborted).toBe(true);
    expect(
      t.deps.revokeObjectUrl.mock.calls.map((call) => call[0]).sort()
    ).toEqual(['blob:a.png', 'blob:b.png']);
    await flush();
    // The queued second file never starts after cancel.
    expect(t.deps.upload).toHaveBeenCalledTimes(1);
  });

  it('accepts new files after a cancel without leaking the old run', async () => {
    const t = setup();
    t.store.addFiles([pdf('a.pdf')], false);
    await flush();
    t.store.cancelAll();
    t.store.addFiles([pdf('b.pdf')], false);
    await flush();
    expect(t.uploads).toHaveLength(2);
    t.uploads[1]?.succeed();
    await flush();
    expect(t.statuses()).toEqual(['uploaded']);
  });

  it('never reports an unhandled rejection for failures after cancel', async () => {
    const t = setup();
    t.deps.remove.mockRejectedValue(new Error('offline'));
    t.store.addFiles([pdf('a.pdf')], false);
    await flush();
    t.store.cancelAll();
    t.uploads[0]?.fail();
    await flush();
    expect(t.store.getSnapshot().items).toEqual([]);
  });
});

describe('derived state', () => {
  it('summarizes the send gate from every non-settled status', () => {
    const items = ['queued', 'uploading', 'failed', 'removing', 'uploaded'].map(
      (status) => ({ status }) as MailMediaItem
    );
    expect(summarizeMedia(items)).toEqual({
      failed: 1,
      queued: 1,
      removing: 1,
      uploading: 1,
    });
  });

  it('shows an uploaded inline image only in the editor unless the body lost it', () => {
    const t = setup();
    t.store.reset(
      [attachment('img', 'inline'), attachment('file', 'attachment')],
      OWNER
    );
    const items = t.store.getSnapshot().items;
    const withImage =
      '<p><img src="/api/v1/workspaces/w/mail/mailboxes/m/drafts/d/attachments/img"></p>';
    expect(visibleMediaChips(items, withImage).map((item) => item.id)).toEqual([
      'file',
    ]);
    expect(
      visibleMediaChips(items, '<p>no image</p>').map((item) => item.id)
    ).toEqual(['img', 'file']);
  });

  it('keeps pending and failed attachments visible as chips', async () => {
    const t = setup();
    t.store.addFiles([pdf('a.pdf')], false);
    await flush();
    t.uploads[0]?.fail();
    await flush();
    expect(visibleMediaChips(t.store.getSnapshot().items, '')).toHaveLength(1);
  });

  it('announces events with a sequence number', async () => {
    const t = setup();
    t.store.addFiles([pdf('a.pdf')], false);
    await flush();
    t.uploads[0]?.succeed();
    await flush();
    const snapshot = t.store.getSnapshot();
    expect(snapshot.announcement).toEqual({ kind: 'uploaded', name: 'a.pdf' });
    expect(snapshot.announcementSeq).toBeGreaterThanOrEqual(2);
  });
});
