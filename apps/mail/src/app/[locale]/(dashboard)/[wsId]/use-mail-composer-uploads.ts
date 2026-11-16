import {
  deleteMailDraftAttachment,
  type MailAttachment,
  uploadMailDraftAttachment,
} from '@tuturuuu/internal-api';
import { withAppBase } from '@tuturuuu/start-bridge/app-url';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { MailImageNodes } from './mail-composer-image-nodes';
import {
  isMediaInFlight,
  isMediaSettled,
  summarizeMedia,
  uploadedAttachments,
} from './mail-composer-upload-state';
import { MailUploadStore } from './mail-composer-upload-store';

const DECODE_TIMEOUT_MS = 15_000;

/** Natural size of an image URL once decoded; null when it cannot be decoded. */
export function decodeMailImage(src: string) {
  return new Promise<{ height: number; width: number } | null>((resolve) => {
    if (typeof Image === 'undefined') return resolve(null);
    const image = new Image();
    const timer = setTimeout(() => resolve(null), DECODE_TIMEOUT_MS);
    const settle = (ok: boolean) => {
      clearTimeout(timer);
      resolve(
        ok && image.naturalWidth > 0
          ? { height: image.naturalHeight, width: image.naturalWidth }
          : null
      );
    };
    if (typeof image.decode === 'function') {
      image.src = src;
      image.decode().then(
        () => settle(true),
        () => settle(false)
      );
    } else {
      image.onload = () => settle(true);
      image.onerror = () => settle(false);
      image.src = src;
    }
  });
}

/**
 * Composer-facing wrapper around the upload store: wires the real transport,
 * the editor's node operations and the remove-failed toast. React sees only
 * item snapshots, so uploads never re-render the editor.
 */
export function useMailComposerUploads({
  draftIdRef,
  ensureDraft,
  mailboxId,
  workspaceId,
}: {
  draftIdRef: RefObject<string | null>;
  /** Create the draft (flushing the latest body) when it does not exist yet. */
  ensureDraft: () => Promise<string | null>;
  mailboxId: string;
  workspaceId: string;
}) {
  const t = useTranslations('mail');
  const latest = useRef({ ensureDraft, mailboxId, t, workspaceId });
  latest.current = { ensureDraft, mailboxId, t, workspaceId };
  const nodesRef = useRef<MailImageNodes | null>(null);

  const [store] = useState(
    () =>
      new MailUploadStore({
        createObjectUrl: (file) => URL.createObjectURL(file),
        decodeImage: (src) => decodeMailImage(withAppBase(src)),
        draftId: () => draftIdRef.current,
        ensureDraft: () => latest.current.ensureDraft(),
        imageSource: (draftId, attachmentId) =>
          `/api/v1/workspaces/${latest.current.workspaceId}/mail/mailboxes/${latest.current.mailboxId}/drafts/${draftId}/attachments/${attachmentId}`,
        newId: () => crypto.randomUUID(),
        nodes: () => nodesRef.current,
        onRemoveFailed: (item, retry) =>
          toast.error(latest.current.t('remove_failed', { name: item.name }), {
            action: { label: latest.current.t('retry'), onClick: retry },
          }),
        remove: (draftId, attachmentId) =>
          deleteMailDraftAttachment(
            latest.current.workspaceId,
            latest.current.mailboxId,
            draftId,
            attachmentId
          ),
        revokeObjectUrl: (url) => URL.revokeObjectURL(url),
        // The shared transport takes a custom fetch; wrapping it adds
        // cancellation without changing the transport.
        upload: async ({ contentId, draftId, file, inline, signal }) =>
          (
            await uploadMailDraftAttachment(
              latest.current.workspaceId,
              latest.current.mailboxId,
              draftId,
              file,
              file.name,
              { contentId, disposition: inline ? 'inline' : 'attachment' },
              { fetch: (input, init) => fetch(input, { ...init, signal }) }
            )
          ).attachment,
      })
  );
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );
  useEffect(() => () => store.dispose(), [store]);

  const summary = useMemo(
    () => summarizeMedia(snapshot.items),
    [snapshot.items]
  );
  const attachments = useMemo(
    () => uploadedAttachments(snapshot.items),
    [snapshot.items]
  );
  const setNodes = useCallback((nodes: MailImageNodes | null) => {
    nodesRef.current = nodes;
  }, []);

  return {
    addFiles: useCallback(
      (files: FileList | File[], inline = false) =>
        store.addFiles(Array.from(files), inline),
      [store]
    ),
    addUploaded: useCallback(
      (items: MailAttachment[]) => store.addUploaded(items),
      [store]
    ),
    announcement: snapshot.announcement,
    announcementSeq: snapshot.announcementSeq,
    attachments,
    cancelAll: useCallback(() => store.cancelAll(), [store]),
    inFlight: isMediaInFlight(summary),
    items: snapshot.items,
    onNodesChange: useCallback(() => store.reconcileNodes(), [store]),
    remove: useCallback((id: string) => store.remove(id), [store]),
    reset: useCallback(
      (items: MailAttachment[]) => store.reset(items),
      [store]
    ),
    retry: useCallback((id: string) => store.retry(id), [store]),
    setNodes,
    settled: isMediaSettled(summary),
    summary,
  };
}
