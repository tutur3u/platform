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
  type MailMediaOwner,
  visibleMediaChips,
} from './mail-composer-upload-state';

describe('late results keep the context they started in', () => {
  const later: MailMediaOwner = {
    draftId: 'draft-2',
    mailboxId: 'box-2',
    workspaceId: 'ws-2',
  };
  /** The composer is closed and reopened on another workspace, mailbox and draft. */
  const reopen = (t: ReturnType<typeof setup>) => {
    t.store.cancelAll();
    t.draft.id = later.draftId;
    t.context.mailboxId = later.mailboxId;
    t.context.workspaceId = later.workspaceId;
  };

  it('deletes a late cancelled upload from the draft it was uploaded to', async () => {
    const t = setup({ honorAbort: false });
    t.store.addFiles([png('a.png')], true);
    await flush();
    reopen(t);
    t.uploads[0]?.succeed();
    await flush();
    expect(t.deps.remove).toHaveBeenCalledExactlyOnceWith(OWNER, 'att1');
    expect(t.deps.remove).not.toHaveBeenCalledWith(later, expect.anything());
    expect(t.store.getSnapshot().items).toEqual([]);
  });

  it('uploads to the context captured when the item started', async () => {
    const t = setup();
    t.store.addFiles([png('a.png')], true);
    await flush();
    t.context.workspaceId = later.workspaceId;
    t.uploads[0]?.succeed();
    await flush();
    expect(t.uploads[0]?.input.owner).toEqual(OWNER);
    expect(t.fake.calls).toContain(
      'resolve:id1:/api/v1/workspaces/ws/mail/mailboxes/box/drafts/draft/attachments/att1'
    );
    expect(t.find('id1')?.owner).toEqual(OWNER);
  });

  it('removes an old attachment from its own draft after the context changed', async () => {
    const t = setup();
    t.store.reset([attachment('old', 'attachment')], OWNER);
    t.context.workspaceId = later.workspaceId;
    t.context.mailboxId = later.mailboxId;
    t.draft.id = later.draftId;
    t.store.remove('old');
    await flush();
    expect(t.deps.remove).toHaveBeenCalledExactlyOnceWith(OWNER, 'old');
  });

  it('never targets another owner even when the attachment ids match', async () => {
    const t = setup({ honorAbort: false });
    t.store.addFiles([pdf('a.pdf')], false);
    await flush();
    reopen(t);
    t.store.reset([attachment('att1', 'attachment')], later);
    t.uploads[0]?.succeed();
    await flush();
    // The late object is cleaned up in the old draft; the new draft's own
    // attachment with the same id is untouched.
    expect(t.deps.remove).toHaveBeenCalledExactlyOnceWith(OWNER, 'att1');
    expect(t.statuses()).toEqual(['uploaded']);
    expect(t.find('att1')?.owner).toEqual(later);
  });
});

describe('image instances and their shared attachment', () => {
  const same = (t: ReturnType<typeof setup>) => {
    t.store.reset([attachment('img', 'inline')], OWNER);
    t.fake.addSettled('first', 'img');
    t.fake.addSettled('second', 'img');
  };

  it('removes the selected later duplicate and leaves the first untouched', async () => {
    const t = setup();
    same(t);
    t.store.removeImage('second');
    expect([...t.fake.ids.keys()]).toEqual(['first']);
    expect(t.deps.remove).not.toHaveBeenCalled();
    expect(t.statuses()).toEqual(['uploaded']);
    await flush();
    expect(t.deps.remove).not.toHaveBeenCalled();
  });

  it('deletes the attachment only after the last remaining reference', async () => {
    const t = setup();
    same(t);
    t.store.removeImage('first');
    t.store.removeImage('second');
    expect(t.fake.calls).toContain('removing:second:true');
    expect(t.statuses()).toEqual(['removing']);
    expect(t.deps.remove).toHaveBeenCalledExactlyOnceWith(OWNER, 'img');
    await flush();
    expect(t.store.getSnapshot().items).toEqual([]);
    expect(t.fake.ids.size).toBe(0);
  });

  it('shows no chip for an attachment that still has a node', () => {
    const t = setup();
    same(t);
    t.store.removeImage('first');
    const html =
      '<img src="/api/v1/workspaces/ws/mail/mailboxes/box/drafts/draft/attachments/img">';
    expect(visibleMediaChips(t.store.getSnapshot().items, html)).toEqual([]);
  });

  it('restores the same node at its position when the last delete fails', async () => {
    const t = setup();
    same(t);
    t.store.removeImage('first');
    t.deps.remove.mockRejectedValueOnce(new Error('offline'));
    t.store.removeImage('second');
    await flush();
    expect(t.fake.calls).toContain('removing:second:false');
    expect(t.fake.calls).not.toContain('remove:second');
    expect([...t.fake.ids.keys()]).toEqual(['second']);
    expect(t.statuses()).toEqual(['uploaded']);
    expect(t.deps.onRemoveFailed).toHaveBeenCalledTimes(1);
    const retry = t.deps.onRemoveFailed.mock.calls[0]?.[1] as () => void;
    retry();
    await flush();
    expect(t.deps.remove).toHaveBeenCalledTimes(2);
    expect(t.fake.ids.size).toBe(0);
    expect(t.store.getSnapshot().items).toEqual([]);
  });

  it('removes a node that no attachment of the draft backs without a request', () => {
    const t = setup();
    t.fake.addSettled('external', null);
    t.fake.addSettled('stranger', 'unknown');
    t.store.removeImage('external');
    t.store.removeImage('stranger');
    expect(t.fake.ids.size).toBe(0);
    expect(t.deps.remove).not.toHaveBeenCalled();
  });

  it('ignores an instance that is no longer in the document', () => {
    const t = setup();
    same(t);
    t.store.removeImage('gone');
    expect(t.fake.ids.size).toBe(2);
    expect(t.deps.remove).not.toHaveBeenCalled();
  });

  it('cancels a failed placeholder locally when removed as an image', async () => {
    const t = setup();
    t.store.addFiles([png('a.png')], true);
    await flush();
    t.uploads[0]?.fail();
    await flush();
    t.store.removeImage('id1');
    expect(t.store.getSnapshot().items).toEqual([]);
    expect(t.fake.ids.size).toBe(0);
    expect(t.deps.remove).not.toHaveBeenCalled();
  });

  it('removes an image uploaded in this session by the id of a pasted copy', async () => {
    const t = setup();
    t.store.addFiles([png('a.png')], true);
    await flush();
    t.uploads[0]?.succeed();
    await flush();
    // A paste carries no client id: the copy is a new instance of att1.
    t.fake.addSettled('copy', 'att1');
    t.store.removeImage('copy');
    expect([...t.fake.ids.keys()]).toEqual(['id1']);
    expect(t.deps.remove).not.toHaveBeenCalled();
    t.store.removeImage('id1');
    await flush();
    expect(t.deps.remove).toHaveBeenCalledExactlyOnceWith(OWNER, 'att1');
    expect(t.store.getSnapshot().items).toEqual([]);
  });

  it('deletes a node an undo brought back while its attachment was removed', async () => {
    const t = setup();
    t.store.reset([attachment('img', 'inline')], OWNER);
    // Orphan chip: the body lost the image, so the chip is the way to remove it.
    t.store.remove('img');
    t.fake.addSettled('revived', 'img');
    await flush();
    expect(t.fake.ids.size).toBe(0);
    expect(t.store.getSnapshot().items).toEqual([]);
  });
});

describe('uploaded attachment reference', () => {
  it('keeps the same array through status-only updates', async () => {
    const t = setup();
    t.store.reset([attachment('a', 'attachment')], OWNER);
    const first = t.store.getSnapshot().attachments;
    const itemsBefore = t.store.getSnapshot().items;
    t.store.addFiles([pdf('b.pdf')], false);
    await flush();
    t.uploads[0]?.fail();
    await flush();
    t.store.retry('id1');
    await flush();
    expect(t.store.getSnapshot().items).not.toBe(itemsBefore);
    expect(t.store.getSnapshot().attachments).toBe(first);
  });

  it('changes only when the uploaded attachments change', async () => {
    const t = setup();
    t.store.addFiles([pdf('a.pdf')], false);
    await flush();
    const before = t.store.getSnapshot().attachments;
    expect(before).toEqual([]);
    t.uploads[0]?.succeed();
    await flush();
    const after = t.store.getSnapshot().attachments;
    expect(after).not.toBe(before);
    expect(after.map((entry) => entry.id)).toEqual(['att1']);
    t.deps.remove.mockRejectedValueOnce(new Error('offline'));
    t.store.remove('id1');
    // Removing hides the item at once, so the message no longer counts it.
    expect(t.store.getSnapshot().attachments).toEqual([]);
    await flush();
    expect(t.store.getSnapshot().attachments.map((entry) => entry.id)).toEqual([
      'att1',
    ]);
  });
});
