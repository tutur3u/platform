'use client';
import { useQueryClient } from '@tanstack/react-query';
import { InternalApiError } from '@tuturuuu/internal-api';
import {
  applyLettinNotebookImport,
  exportLettinNotebook,
  type LettinImportPreview,
  previewLettinNotebookImport,
} from '@tuturuuu/internal-api/lettin';
import type { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { useEffect, useRef, useState } from 'react';
import {
  clearExpiredCopyReceipt,
  copyReceiptKey,
  readCopyReceipt,
  writeCopyReceipt,
} from './notebook-copy-receipt';

export function useNotebookCopy({
  wsId,
  worldId,
  initialTitle,
  actor,
  disabled,
}: {
  wsId: string;
  worldId: string;
  initialTitle: string;
  actor: ReturnType<typeof useWorkspaceActor>;
  disabled: boolean;
}) {
  const client = useQueryClient();
  const receiptKey = actor
    ? copyReceiptKey(actor.actorId, wsId, worldId)
    : undefined;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle.slice(0, 160));
  const [consent, setConsent] = useState(false);
  const [preview, setPreview] = useState<LettinImportPreview>();
  const [created, setCreated] = useState<string>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(true);
  const epoch = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    const receipt = receiptKey ? readCopyReceipt(receiptKey) : undefined;
    setCreated(receipt?.worldId);
    setUncertain(receipt?.status === 'unknown');
    setError(receipt?.status === 'unknown' ? 'notebookCopyUncertain' : '');
  }, [receiptKey]);

  useEffect(
    () => () => {
      epoch.current++;
    },
    []
  );
  function reset() {
    epoch.current++;
    setTitle(initialTitle.slice(0, 160));
    setConsent(false);
    setPreview(undefined);
    const receipt = receiptKey ? readCopyReceipt(receiptKey) : undefined;
    setCreated(receipt?.worldId);
    setError(receipt?.status === 'unknown' ? 'notebookCopyUncertain' : '');
    setUncertain(receipt?.status === 'unknown');
  }
  async function submit() {
    if (
      !actor ||
      !receiptKey ||
      !!readCopyReceipt(receiptKey) ||
      disabled ||
      busy.current ||
      !consent ||
      !title.trim() ||
      created ||
      uncertain
    )
      return;
    const intent = epoch.current;
    const assertCurrent = () => {
      actor.assertActive();
      if (epoch.current !== intent) throw new Error('Copy context changed');
    };
    busy.current = true;
    setPending(true);
    setError('');
    let applying = false;
    try {
      assertCurrent();
      if (!preview) {
        const payload = await exportLettinNotebook(wsId, {
          worldId,
          scope: 'draft',
          privateConsent: true,
          expectedActor: actor.actorId,
        });
        assertCurrent();
        const reviewed = await previewLettinNotebookImport(wsId, {
          title: title.trim(),
          payload,
          consent: true,
          expectedActor: actor.actorId,
        });
        assertCurrent();
        setPreview(reviewed);
      } else {
        writeCopyReceipt(receiptKey, {
          previewId: preview.id,
          status: 'unknown',
        });
        setUncertain(true);
        applying = true;
        const result = await applyLettinNotebookImport(wsId, {
          previewId: preview.id,
          consent: true,
          expectedActor: actor.actorId,
        });
        writeCopyReceipt(receiptKey, {
          previewId: preview.id,
          status: 'confirmed',
          worldId: result.id,
        });
        assertCurrent();
        setCreated(result.id);
        setUncertain(false);
        setPreview(undefined);
        try {
          await client.invalidateQueries({ queryKey: ['lettin', wsId] });
          assertCurrent();
        } catch {
          if (epoch.current === intent) setError('notebookCopyRefreshFailed');
        }
      }
    } catch (failure) {
      // Applied previews return their identity before the server checks expiry.
      // Expiry only permits another intent when its matching receipt was removed.
      const expiredReceiptCleared =
        applying &&
        preview &&
        failure instanceof InternalApiError &&
        failure.status === 410 &&
        clearExpiredCopyReceipt(receiptKey, preview.id);
      if (epoch.current === intent) {
        if (expiredReceiptCleared) {
          setUncertain(false);
          setError('importExpired');
        } else if (applying) {
          setUncertain(true);
          setError('notebookCopyUncertain');
        } else setError('requestFailed');
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return {
    open,
    title,
    consent,
    preview,
    created,
    error,
    pending,
    allowed:
      !!actor &&
      !disabled &&
      consent &&
      !!title.trim() &&
      !uncertain &&
      !created,
    setOpen(value: boolean) {
      reset();
      setOpen(value);
    },
    setTitle(value: string) {
      epoch.current++;
      setTitle(value);
      setPreview(undefined);
    },
    setConsent(value: boolean) {
      epoch.current++;
      setConsent(value);
      setPreview(undefined);
    },
    back() {
      epoch.current++;
      setPreview(undefined);
      setConsent(false);
      setError('');
    },
    submit,
  };
}
