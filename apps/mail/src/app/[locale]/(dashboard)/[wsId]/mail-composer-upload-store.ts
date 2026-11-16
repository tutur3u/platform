import type { MailAttachment } from '@tuturuuu/internal-api';
import type { MailImageNodes } from './mail-composer-image-nodes';
import {
  EMPTY_MEDIA_SNAPSHOT,
  type MailMediaAnnouncement,
  type MailMediaItem,
  type MailMediaOwner,
  type MailMediaSnapshot,
  seedMediaItems,
  stableAttachments,
  uploadedAttachments,
} from './mail-composer-upload-state';

/** Everything the store needs from the outside world, injectable for tests. */
export interface MailUploadDeps {
  createObjectUrl: (file: Blob) => string;
  /** Natural size once the browser decodes the image; null if it cannot. */
  decodeImage: (
    src: string
  ) => Promise<{ height: number; width: number } | null>;
  /** The draft id if one already exists. */
  draftId: () => string | null;
  /** Create the draft when it does not exist yet; null when saving failed. */
  ensureDraft: () => Promise<string | null>;
  /** Raw (host independent) editor source of an uploaded draft image. */
  imageSource: (owner: MailMediaOwner, attachmentId: string) => string;
  newId: () => string;
  nodes: () => MailImageNodes | null;
  onRemoveFailed: (item: MailMediaItem, retry: () => void) => void;
  /** Delete an attachment from the draft that owns it, whatever is open now. */
  remove: (owner: MailMediaOwner, attachmentId: string) => Promise<void>;
  revokeObjectUrl: (url: string) => void;
  /** Workspace and mailbox the composer shows right now. */
  scope: () => { mailboxId: string; workspaceId: string };
  upload: (input: {
    contentId: string | null;
    file: File;
    inline: boolean;
    owner: MailMediaOwner;
    signal: AbortSignal;
  }) => Promise<MailAttachment>;
}

function isNotFound(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 404
  );
}

/**
 * Orchestrates uploads and removals for one composer, outside React.
 *
 * - Every file becomes an item at once (`queued`) and uploads one at a time.
 * - Work is addressed by item id, never by position or index, so typing and
 *   deleting around a placeholder cannot misdirect a result.
 * - A cancelled item never resurrects: its late result is ignored, and an
 *   attachment the server did create for it (a known id) is deleted quietly.
 *   Nothing is ever deleted for an upload whose outcome is unknown.
 * - Every attachment remembers the draft that owns it (workspace, mailbox and
 *   draft id captured when it was created), so a late cleanup or a removal
 *   after the composer was closed and reopened never reads the current one.
 * - Images are addressed by instance id (one editor node), attachments by item
 *   id. Several nodes can show one attachment; it is deleted from the server
 *   only when its last node is removed.
 * - Removal of an uploaded item is optimistic and rolls back to the same list
 *   position (the item never leaves the list) when the delete fails.
 */
export class MailUploadStore {
  private snapshot: MailMediaSnapshot = EMPTY_MEDIA_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private readonly files = new Map<string, File>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly deletedAttachments = new Set<string>();
  private clock = 0;
  private running = false;

  constructor(private readonly deps: MailUploadDeps) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  /** Replace everything with the attachments of a freshly opened draft. */
  reset(attachments: MailAttachment[], owner: MailMediaOwner | null) {
    this.cancelAll(false);
    this.commit(seedMediaItems(attachments, owner));
  }

  /** Server-created attachments (forwarded files) join as uploaded items. */
  addUploaded(attachments: MailAttachment[], owner: MailMediaOwner) {
    this.commit([...this.items(), ...seedMediaItems(attachments, owner)]);
  }

  /** Abort every request, drop every item and release every preview URL. */
  cancelAll(notify = true) {
    this.deletedAttachments.clear();
    for (const item of this.items()) {
      if (
        item.attachment &&
        item.owner &&
        item.status !== 'uploaded' &&
        !this.controllers.has(item.id)
      )
        this.discardLate(item.owner, item.attachment);
    }
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    this.files.clear();
    for (const item of this.items()) this.release(item);
    if (notify && this.items().length) this.commit([]);
    else this.snapshot = { ...this.snapshot, attachments: [], items: [] };
  }

  /**
   * Unmount cleanup: abort requests and release preview URLs without touching
   * the item list, so a development-mode remount keeps seeded attachments.
   */
  dispose() {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    this.files.clear();
    for (const item of this.items()) this.release(item);
  }

  addFiles(files: Iterable<File>, inline: boolean) {
    const added: MailMediaItem[] = [];
    for (const file of files) {
      const id = this.deps.newId();
      const image = inline && file.type.startsWith('image/');
      const previewUrl = image ? this.deps.createObjectUrl(file) : null;
      // The editor node is inserted synchronously, before the upload starts.
      const placed =
        image && previewUrl
          ? (this.deps.nodes()?.insertPending({
              name: file.name,
              src: previewUrl,
              state: 'queued',
              uploadId: id,
            }) ?? false)
          : false;
      if (!placed && previewUrl) this.deps.revokeObjectUrl(previewUrl);
      this.files.set(id, file);
      added.push({
        attachment: null,
        id,
        kind: placed ? 'inline' : 'attachment',
        name: file.name,
        owner: null,
        previewUrl: placed ? previewUrl : null,
        queuedAt: ++this.clock,
        sizeBytes: file.size,
        status: 'queued',
      });
      if (placed && previewUrl) this.measurePreview(id, previewUrl);
    }
    const last = added.at(-1);
    if (!last) return;
    this.commit([...this.items(), ...added], {
      kind: 'added',
      name: last.name,
    });
    void this.pump();
  }

  retry(id: string) {
    const item = this.find(id);
    if (!item || item.status !== 'failed') return;
    this.update(id, { queuedAt: ++this.clock, status: 'queued' });
    this.deps.nodes()?.setState(id, 'queued');
    void this.pump();
  }

  /** Remove an item (a chip, or a placeholder) by its item id. */
  remove(id: string) {
    const item = this.find(id);
    if (!item || item.status === 'removing') return;
    if (
      item.attachment &&
      (item.status === 'failed' || item.status === 'queued')
    ) {
      this.removeUploaded(item, item.kind === 'inline' ? id : null);
      return;
    }
    if (item.status !== 'uploaded') {
      // Not on the server (or its outcome is unknown): cancel locally only.
      this.controllers.get(id)?.abort();
      this.controllers.delete(id);
      // Drop the item first so the node-deleted reconcile finds nothing to do.
      this.discard(id, { kind: 'removed', name: item.name });
      this.deps.nodes()?.remove(id);
      return;
    }
    this.removeUploaded(item, null);
  }

  /**
   * Remove one image node by instance id. The node goes at once. Its
   * attachment is deleted only when no other node shows it; the node is then
   * hidden in place until the delete settles, so a failure restores that very
   * node at its position.
   */
  removeImage(instanceId: string) {
    const pending = this.find(instanceId);
    if (pending && pending.status !== 'uploaded')
      return this.remove(instanceId);
    const nodes = this.deps.nodes();
    const info = nodes?.inspect(instanceId);
    if (!nodes || !info) return;
    const attachmentId = info.attachmentId;
    const backing = attachmentId
      ? this.items().find(
          (item) =>
            item.status === 'uploaded' && item.attachment?.id === attachmentId
        )
      : undefined;
    if (!attachmentId || !backing) {
      nodes.remove(instanceId);
      return;
    }
    if (nodes.references(attachmentId, instanceId) > 0) {
      nodes.remove(instanceId);
      this.commit(this.items(), { kind: 'removed', name: backing.name });
      return;
    }
    this.removeUploaded(backing, instanceId);
  }

  /**
   * Cancel placeholders whose editor node the user deleted (for example with
   * the keyboard). Cheap when nothing is pending.
   */
  reconcileNodes() {
    const nodes = this.deps.nodes();
    // Undo can restore a keyboard-deleted image after its orphan chip has
    // deleted the server attachment. Keep that source fenced for this session.
    for (const attachmentId of this.deletedAttachments)
      nodes?.removeReferences(attachmentId);
    const pending = this.items().filter(
      (item) =>
        item.kind === 'inline' &&
        (item.status === 'queued' ||
          item.status === 'uploading' ||
          item.status === 'failed')
    );
    if (!pending.length || !nodes) return;
    const live = nodes.liveIds();
    for (const item of pending) {
      if (live.has(item.id)) continue;
      this.controllers.get(item.id)?.abort();
      this.controllers.delete(item.id);
      this.discard(item.id, null);
    }
  }

  private items() {
    return this.snapshot.items;
  }

  private find(id: string) {
    return this.items().find((item) => item.id === id);
  }

  private commit(items: MailMediaItem[], announcement?: MailMediaAnnouncement) {
    this.snapshot = {
      announcement: announcement ?? this.snapshot.announcement,
      announcementSeq: this.snapshot.announcementSeq + (announcement ? 1 : 0),
      attachments: stableAttachments(
        this.snapshot.attachments,
        uploadedAttachments(items)
      ),
      items,
    };
    for (const listener of this.listeners) listener();
  }

  private update(
    id: string,
    changes: Partial<MailMediaItem>,
    announcement?: MailMediaAnnouncement
  ) {
    this.commit(
      this.items().map((item) =>
        item.id === id ? { ...item, ...changes } : item
      ),
      announcement
    );
  }

  private release(item: MailMediaItem) {
    if (item.previewUrl) this.deps.revokeObjectUrl(item.previewUrl);
  }

  private discard(id: string, announcement: MailMediaAnnouncement) {
    const item = this.find(id);
    if (!item) return;
    this.files.delete(id);
    this.release(item);
    this.commit(
      this.items().filter((entry) => entry.id !== id),
      announcement
    );
  }

  private removeUploaded(item: MailMediaItem, instanceId: string | null) {
    const { attachment, id, owner } = item;
    this.update(
      id,
      { status: 'removing' },
      { kind: 'removed', name: item.name }
    );
    if (instanceId) this.deps.nodes()?.setRemoving(instanceId, true);
    if (!attachment || !owner) {
      this.finishRemoval(id, instanceId);
      return;
    }
    void this.deps.remove(owner, attachment.id).then(
      () => this.finishRemoval(id, instanceId),
      (error: unknown) => {
        if (isNotFound(error)) return this.finishRemoval(id, instanceId);
        if (this.find(id)?.status !== 'removing') return;
        // Same item, same list position: only its status changes back.
        this.update(
          id,
          { status: item.status },
          { kind: 'restored', name: item.name }
        );
        if (instanceId) this.deps.nodes()?.setRemoving(instanceId, false);
        if (instanceId && item.status === 'failed')
          this.deps.nodes()?.setState(instanceId, 'failed');
        this.deps.onRemoveFailed(item, () =>
          instanceId ? this.removeImage(instanceId) : this.remove(id)
        );
      }
    );
  }

  private finishRemoval(id: string, instanceId: string | null) {
    const item = this.find(id);
    if (item?.status !== 'removing') return;
    const nodes = this.deps.nodes();
    if (instanceId) nodes?.remove(instanceId);
    // An undo may have brought a node back while the delete was in flight.
    if (item.attachment) {
      this.deletedAttachments.add(item.attachment.id);
      nodes?.removeReferences(item.attachment.id);
    }
    this.discard(id, null);
  }

  private measurePreview(id: string, previewUrl: string) {
    void this.deps
      .decodeImage(previewUrl)
      .then((size) => {
        if (size && this.find(id)?.previewUrl === previewUrl)
          this.deps.nodes()?.setSize(id, size.width, size.height);
      })
      .catch(() => undefined);
  }

  /** The upload finished after its item was cancelled: clean up our own object. */
  private discardLate(owner: MailMediaOwner, attachment: MailAttachment) {
    void this.deps.remove(owner, attachment.id).catch(() => undefined);
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const next = this.items()
          .filter((item) => item.status === 'queued')
          .sort((a, b) => a.queuedAt - b.queuedAt)[0];
        if (!next) return;
        await this.run(next);
      }
    } finally {
      this.running = false;
    }
  }

  private async run(item: MailMediaItem) {
    const { id } = item;
    const file = this.files.get(id);
    if (!file) {
      this.discard(id, null);
      return;
    }
    const controller = new AbortController();
    this.controllers.set(id, controller);
    const alive = () =>
      this.controllers.get(id) === controller && !controller.signal.aborted;
    // Captured before any await: a result that lands after the composer was
    // closed and reopened still belongs to this workspace, mailbox and draft.
    const scope = this.deps.scope();
    this.update(id, { status: 'uploading' });
    this.deps.nodes()?.setState(id, 'uploading');
    try {
      const draftId =
        item.owner?.draftId ??
        this.deps.draftId() ??
        (await this.deps.ensureDraft());
      if (!alive()) return;
      if (!draftId) throw new Error('Draft was not saved');
      const owner: MailMediaOwner = item.owner ?? { ...scope, draftId };
      const inline = item.kind === 'inline';
      const attachment =
        item.attachment ??
        (await this.deps.upload({
          contentId: inline ? `${this.deps.newId()}@tuturuuu.mail` : null,
          file,
          inline,
          owner,
          signal: controller.signal,
        }));
      if (!alive()) return this.discardLate(owner, attachment);
      this.update(id, { attachment, owner });
      const source = this.deps.imageSource(owner, attachment.id);
      if (inline) {
        // Swap only once the server image has decoded, so nothing flashes.
        const decoded = await this.deps.decodeImage(source);
        if (!alive()) return this.discardLate(owner, attachment);
        if (!decoded) throw new Error('Uploaded image could not be decoded');
        this.deps.nodes()?.resolve(id, source);
      }
      this.controllers.delete(id);
      this.files.delete(id);
      this.release(item);
      this.update(
        id,
        { attachment, owner, previewUrl: null, status: 'uploaded' },
        { kind: 'uploaded', name: item.name }
      );
    } catch {
      if (!alive()) return;
      this.controllers.delete(id);
      this.update(
        id,
        { status: 'failed' },
        { kind: 'failed', name: item.name }
      );
      this.deps.nodes()?.setState(id, 'failed');
    }
  }
}
