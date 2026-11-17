'use client';

import {
  createSenderContact,
  getSenderContactOperation,
} from '@tuturuuu/internal-api/people';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { useRef, useState } from 'react';
import {
  reserveSenderContactOperation,
  senderContactStorageKey,
} from './sender-contact-operation';

export type SenderContactCreateState =
  | { kind: 'idle' | 'unavailable' }
  | { kind: 'pending'; workspaceId: string; operationId: string }
  | { kind: 'unknown'; workspaceId: string; operationId: string }
  | { kind: 'created'; workspaceId: string; contactId: string };

/**
 * Creates a contact for a sender at most once per actor, workspace and
 * address. A reserved operation id survives reloads in session storage, so a
 * retry only reads the earlier operation's status instead of creating again.
 */
export function useSenderContactCreate({
  actorId,
  email,
  onCreated,
}: {
  actorId: string | null;
  email: string;
  onCreated: (workspaceId: string, contactId: string) => void;
}) {
  const [state, setState] = useState<SenderContactCreateState>({
    kind: 'idle',
  });
  const submitting = useRef(false);

  async function submit(workspaceId: string, name: string) {
    if (!actorId || submitting.current) return;
    submitting.current = true;
    let operationId: string | undefined;
    try {
      const reservation = reserveSenderContactOperation(
        sessionStorage,
        senderContactStorageKey(actorId, workspaceId, email),
        () => crypto.randomUUID()
      );
      operationId = reservation.operationId;
      setState({ kind: 'pending', workspaceId, operationId });
      const result =
        reservation.kind === 'existing'
          ? await getSenderContactOperation(workspaceId, operationId)
          : await createSenderContact(workspaceId, {
              operationId,
              email,
              displayName: name.trim().slice(0, MAX_NAME_LENGTH) || null,
            });
      if (result.state === 'created') {
        setState({ kind: 'created', workspaceId, contactId: result.contactId });
        onCreated(workspaceId, result.contactId);
      } else setState({ kind: 'unknown', workspaceId, operationId });
    } catch {
      setState(
        operationId
          ? { kind: 'unknown', workspaceId, operationId }
          : { kind: 'unavailable' }
      );
    } finally {
      submitting.current = false;
    }
  }

  return { state, submit };
}
