import type { MailAttachment } from '@tuturuuu/internal-api';
import type { MailImageNodes } from './mail-composer-image-nodes';
import {
  EMPTY_MEDIA_SNAPSHOT,
  type MailMediaAnnouncement,
  type MailMediaItem,
  type MailMediaSnapshot,
  seedMediaItems,
} from './mail-composer-upload-state';

/** Everything the store needs from the outside world, injectable for tests. */
export interface MailUploadDeps {
  createObjectUrl: (file: Blob) => string;
  /** Natural size once the browser decodes the image; null if it cannot. */
  decodeImage: (src: string) => Promise<{ height: number; width: number } | null>;
  /** The draft id if one already exists. */
  draftId: () => string | null;
  /** Create the draft when it does not exist yet; null when saving failed. */
  ensureDraft: () => Promise<string | null>;
  /** Raw (host independent) editor source of an uploaded draft image. */
  imageSource: (draftId: string, attachmentId: string) => string;
  newId: () => string;
  nodes: () => MailImageNodes | null;
  onRemoveFailed: (item: MailMediaItem, retry: () => void) => void;
  remove: (draftId: string, attachmentId: string) => Promise<void>;
  revokeObjectUrl: (url: string) => void;
  upload: (input: {
    contentId: string | null;
    draftId: string;
    file: File;
    inline: boolean;
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
 * - Removal of an uploaded item is optimistic and rolls back to the same list
 *   position (the item never leaves the list) when the delete fails.
 */
export class MailUploadStore {
  private snapshot: MailMediaSnapshot = EMPTY_MEDIA_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private readonly files = new Map<string, File>();
  private readonly controllers = new Map<string, AbortController>();
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
  reset(attachments: MailAttachment[]) {
    this.cancelAll(false);
    this.commit(seedMediaItems(attachments));
  }

  /** Server-created attachments (forwarded files) join as uploaded items. */
  addUploaded(attachments: MailAttachment[]) {
    this.commit([...this.items(), ...seedMediaItems(attachments)]);
  }

  /** Abort every request, drop every item and release every preview URL. */
  cancelAll(notify = true) {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    this.files.clear();
    for (const item of this.items()) this.release(item);
    if (notify && this.items().length) this.commit([]);
    else this.snapshot = { ...this.snapshot, items: [] };
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
        previewUrl: placed ? previewUrl : null,
        queuedAt: ++this.clock,
        sizeBytes: file.size,
        status: 'queued',
      });
      if (placed && previewUrl) this.measurePreview(id, previewUrl);
    }
    const last = added.at(-1);
    if (!last) return;
    this.commit([...this.items(), ...added], { kind: 'added', name: last.name });
    void this.pump();
  }

  retry(id: string) {
    const item = this.find(id);
    if (!item || item.status !== 'failed') return;
    this.update(id, { queuedAt: ++this.clock, status: 'queued' });
    this.deps.nodes()?.setState(id, 'queued');
    void this.pump();
  }

  remove(id: string) {
    const item = this.find(id);
    if (!item || item.status === 'removing') return;
    if (item.status !== 'uploaded') {
      // Not on the server (or its outcome is unknown): cancel locally only.
      this.controllers.get(id)?.abort();
      this.controllers.delete(id);
      // Drop the item first so the node-deleted reconcile finds nothing to do.
      this.discard(id, { kind: 'removed', name: item.name });
      this.deps.nodes()?.remove(id);
      return;
    }
    const attachment = item.attachment;
    const draftId = this.deps.draftId();
    this.update(id, { status: 'removing' }, { kind: 'removed', name: item.name });
    this.deps.nodes()?.setRemoving(id, true);
    if (!attachment || !draftId) {
      this.finishRemoval(id);
      return;
    }
    void this.deps.remove(draftId, attachment.id).then(
      () => this.finishRemoval(id),
      (error: unknown) => {
        if (isNotFound(error)) return this.finishRemoval(id);
        if (this.find(id)?.status !== 'removing') return;
        // Same item, same list position: only its status changes back.
        this.update(
          id,
          { status: 'uploaded' },
          { kind: 'restored', name: item.name }
        );
        this.deps.nodes()?.setRemoving(id, false);
        this.deps.onRemoveFailed(item, () => this.remove(id));
      }
    );
  }

  /**
   * Cancel placeholders whose editor node the user deleted (for example with
   * the keyboard). Cheap when nothing is pending.
   */
  reconcileNodes() {
    const pending = this.items().filter(
      (item) =>
        item.kind === 'inline' &&
        (item.status === 'queued' ||
          item.status === 'uploading' ||
          item.status === 'failed')
    );
    const nodes = this.deps.nodes();
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

  private finishRemoval(id: string) {
    const item = this.find(id);
    if (item?.status !== 'removing') return;
    this.deps.nodes()?.remove(id);
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
  private discardLate(draftId: string, attachment: MailAttachment) {
    void this.deps.remove(draftId, attachment.id).catch(() => undefined);
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
    this.update(id, { status: 'uploading' });
    this.deps.nodes()?.setState(id, 'uploading');
    try {
      const draftId = this.deps.draftId() ?? (await this.deps.ensureDraft());
      if (!alive()) return;
      if (!draftId) throw new Error('Draft was not saved');
      const inline = item.kind === 'inline';
      const attachment = await this.deps.upload({
        contentId: inline ? `${this.deps.newId()}@tuturuuu.mail` : null,
        draftId,
        file,
        inline,
        signal: controller.signal,
      });
      if (!alive()) return this.discardLate(draftId, attachment);
      const source = this.deps.imageSource(draftId, attachment.id);
      if (inline) {
        // Swap only once the server image has decoded, so nothing flashes.
        await this.deps.decodeImage(source);
        if (!alive()) return this.discardLate(draftId, attachment);
        this.deps.nodes()?.resolve(id, source);
      }
      this.controllers.delete(id);
      this.files.delete(id);
      this.release(item);
      this.update(
        id,
        { attachment, previewUrl: null, status: 'uploaded' },
        { kind: 'uploaded', name: item.name }
      );
    } catch {
      if (!alive()) return;
      this.controllers.delete(id);
      this.update(id, { status: 'failed' }, { kind: 'failed', name: item.name });
      this.deps.nodes()?.setState(id, 'failed');
    }
  }
}
