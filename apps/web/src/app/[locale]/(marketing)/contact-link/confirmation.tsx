'use client';

import { respondToWorkspaceContactAccountLink } from '@tuturuuu/internal-api/users';
import { Button } from '@tuturuuu/ui/button';
import { useState, useSyncExternalStore, useTransition } from 'react';

const subscribeToBrowserZone = () => () => {};
const readBrowserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const readServerZone = () => 'UTC';

export function ContactLinkConfirmation({
  invitation,
  expiresAt,
  locale,
  copy,
}: {
  invitation: { wsId: string; contactId: string; invitationId: string };
  expiresAt: string;
  locale: string;
  copy: {
    confirm: string;
    confirming: string;
    decline: string;
    declined: string;
    expires: string;
    description: string;
    replacement?: string;
    linked: string;
    unavailable: string;
  };
}) {
  const timeZone = useSyncExternalStore(
    subscribeToBrowserZone,
    readBrowserZone,
    readServerZone
  );
  const expiry = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    timeZone,
    timeZoneName: 'short',
  }).format(new Date(expiresAt));
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<
    'ready' | 'linked' | 'declined' | 'unavailable'
  >('ready');

  function respond(action: 'confirm' | 'decline') {
    startTransition(async () => {
      try {
        const result = await respondToWorkspaceContactAccountLink(
          invitation.wsId,
          {
            action,
            workspaceUserId: invitation.contactId,
            invitationId: invitation.invitationId,
          }
        );
        setOutcome(result.outcome);
      } catch {
        setOutcome('unavailable');
      }
    });
  }

  if (outcome !== 'ready') {
    return <p role="status">{copy[outcome]}</p>;
  }

  return (
    <div className="space-y-4">
      <p>{copy.description}</p>
      {copy.replacement && <p>{copy.replacement}</p>}
      <p className="flex flex-wrap gap-x-1 text-sm text-muted-foreground">
        <span>{copy.expires}</span>
        <time dateTime={expiresAt}>{expiry}</time>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => respond('confirm')}>
          {pending ? copy.confirming : copy.confirm}
        </Button>
        <Button
          disabled={pending}
          onClick={() => respond('decline')}
          variant="outline"
        >
          {copy.decline}
        </Button>
      </div>
    </div>
  );
}
