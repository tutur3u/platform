'use client';

import type { Workspace } from '@tuturuuu/types/db';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import moment from 'moment';
import 'moment/locale/vi';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

interface Props {
  ws: Pick<Workspace, 'id' | 'name' | 'created_at'>;
  transparent?: boolean;
}

const WorkspaceInviteSnippet = ({ ws, transparent = true }: Props) => {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('invite');

  const creationDate = moment(ws?.created_at).locale(locale).fromNow();

  const invitedTo = t('invited-to');

  const declineInviteLabel = t('decline-invite');
  const acceptInviteLabel = t('accept-invite');

  const acceptInviteSuccessTitle = t('accept-invite-success-title');
  const acceptInviteSuccessMessage = t('accept-invite-success-msg');

  const acceptInviteErrorTitle = t('accept-invite-error-title');
  const acceptInviteErrorMessage = t('accept-invite-error-msg');

  const declineInviteSuccessTitle = t('decline-invite-success-title');
  const declineInviteSuccessMessage = t('decline-invite-success-msg');

  const declineInviteErrorTitle = t('decline-invite-error-title');
  const declineInviteErrorMessage = t('decline-invite-error-msg');

  const acceptInvite = async (ws: Pick<Workspace, 'id'>) => {
    const response = await fetch(`/api/workspaces/${ws.id}/accept-invite`, {
      method: 'POST',
    });

    if (response.ok) {
      toast({
        title: acceptInviteSuccessTitle,
        description: acceptInviteSuccessMessage,
        color: 'teal',
      });
      router.refresh();
    } else {
      toast({
        title: acceptInviteErrorTitle,
        description: acceptInviteErrorMessage,
        color: 'red',
      });
    }
  };

  const declineInvite = async (ws: Pick<Workspace, 'id'>) => {
    const response = await fetch(`/api/workspaces/${ws.id}/decline-invite`, {
      method: 'POST',
    });

    if (response.ok) {
      toast({
        title: declineInviteSuccessTitle,
        description: declineInviteSuccessMessage,
        color: 'teal',
      });
      router.refresh();
    } else {
      toast({
        title: declineInviteErrorTitle,
        description: declineInviteErrorMessage,
        color: 'red',
      });
    }
  };

  return (
    <div
      className={`rounded-lg border p-4 ${
        transparent ? 'bg-primary-foreground/40' : 'bg-primary-foreground/40'
      }`}
    >
      <div className="cursor-default font-semibold transition duration-150">
        <span className="text-foreground/60">{invitedTo} </span>
        <Link href={`/${ws.id}`} className="text-foreground hover:underline">
          {ws?.name || `Unnamed Workspace`}
        </Link>
        {ws?.created_at ? (
          <span className="font-normal text-foreground/60">
            {' '}
            • {creationDate}
          </span>
        ) : null}
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <button
          type="button"
          className="flex cursor-pointer items-center justify-center rounded border p-1 font-semibold text-foreground transition duration-300 hover:bg-foreground/5 focus:outline-none focus:ring-2 focus:ring-primary/50"
          onClick={() => declineInvite(ws)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              declineInvite(ws);
            }
          }}
        >
          {declineInviteLabel}
        </button>

        <button
          type="button"
          className="flex flex-1 cursor-pointer items-center justify-center rounded border p-1 font-semibold text-foreground transition duration-300 hover:bg-foreground/5 focus:outline-none focus:ring-2 focus:ring-primary/50"
          onClick={() => acceptInvite(ws)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              acceptInvite(ws);
            }
          }}
        >
          {acceptInviteLabel}
        </button>
      </div>
    </div>
  );
};

export default WorkspaceInviteSnippet;
