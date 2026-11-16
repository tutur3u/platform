'use client';

import { useQuery } from '@tanstack/react-query';
import {
  createSenderContact,
  getContactCreateCapability,
  getSenderContactOperation,
} from '@tuturuuu/internal-api/people';
import { Button } from '@tuturuuu/ui/button';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { useMailActor } from '@/components/mail-actor-provider';
import {
  reserveSenderContactOperation,
  senderContactStorageKey,
} from './sender-contact-operation';

type State =
  | { kind: 'idle' | 'unavailable' }
  | { kind: 'pending'; operationId: string }
  | { kind: 'unknown'; operationId: string }
  | { kind: 'created'; contactId: string };

export function MailSenderContactCreate({
  workspaceId,
  email,
  displayName,
  contactsHref,
  onCreated,
}: {
  workspaceId: string;
  email: string;
  displayName: string | null;
  contactsHref: string;
  onCreated: () => void;
}) {
  const actorId = useMailActor();
  const t = useTranslations('mail.sender_contact');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const submitting = useRef(false);
  const capability = useQuery({
    queryKey: ['mail', 'contact-create-capability', actorId, workspaceId],
    queryFn: () => getContactCreateCapability(workspaceId),
    enabled: Boolean(actorId),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  async function submit() {
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
      setState({ kind: 'pending', operationId });
      const result =
        reservation.kind === 'existing'
          ? await getSenderContactOperation(workspaceId, operationId)
          : await createSenderContact(workspaceId, {
              operationId,
              email,
              displayName: displayName?.slice(0, MAX_NAME_LENGTH) || null,
            });
      if (result.state === 'created') {
        setState({ kind: 'created', contactId: result.contactId });
        onCreated();
      } else setState({ kind: 'unknown', operationId });
    } catch {
      setState(
        operationId ? { kind: 'unknown', operationId } : { kind: 'unavailable' }
      );
    } finally {
      submitting.current = false;
    }
  }

  if (!actorId || !capability.data?.canCreate) return null;
  if (state.kind === 'created')
    return (
      <a
        className="text-primary text-xs underline underline-offset-2"
        href={`${contactsHref}/${encodeURIComponent(state.contactId)}`}
      >
        {t('open')}
      </a>
    );
  return (
    <div className="space-y-2 border-t pt-3">
      {state.kind === 'unknown' ? (
        <p role="status" className="text-muted-foreground text-xs">
          {t('outcome_unknown')}
        </p>
      ) : null}
      {state.kind === 'unavailable' ? (
        <p role="status" className="text-muted-foreground text-xs">
          {t('create_unavailable')}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={state.kind === 'pending'}
        onClick={() => void submit()}
      >
        {state.kind === 'pending'
          ? t('checking')
          : state.kind === 'unknown'
            ? t('check_status')
            : t('add')}
      </Button>
      {state.kind === 'unknown' ? (
        <a
          className="block text-primary text-xs underline underline-offset-2"
          href={contactsHref}
        >
          {t('review_contacts')}
        </a>
      ) : null}
    </div>
  );
}
