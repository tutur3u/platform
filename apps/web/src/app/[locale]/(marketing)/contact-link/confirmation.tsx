'use client';

import { respondToWorkspaceContactAccountLink } from '@tuturuuu/internal-api/users';
import { Button } from '@tuturuuu/ui/button';
import { useState, useTransition } from 'react';

export function ContactLinkConfirmation({
  invitation,
  copy,
}: {
  invitation: { wsId: string; contactId: string; invitationId: string };
  copy: {
    confirm: string;
    confirming: string;
    decline: string;
    declined: string;
    expires: string;
    description: string;
    linked: string;
    unavailable: string;
  };
}) {
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
      <p className="text-sm text-muted-foreground">{copy.expires}</p>
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
