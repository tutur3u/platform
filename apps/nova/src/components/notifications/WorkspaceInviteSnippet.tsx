'use client';

import { Workspace } from '@tuturuuu/types/primitives/Workspace';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import moment from 'moment';
import 'moment/locale/vi';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Props {
  ws: Workspace;
  transparent?: boolean;
}

const WorkspaceInviteSnippet = ({ ws, transparent = true }: Props) => {
  const router = useRouter();
  const locale = useLocale();
  // const t = useTranslations('invite');

  const creationDate = moment(ws?.created_at).locale(locale).fromNow();

  const invitedTo = 'invited-to';

  const declineInviteLabel = 'decline-invite';
  const acceptInviteLabel = 'accept-invite';

  const acceptInviteSuccessTitle = 'accept-invite-success-title';
  const acceptInviteSuccessMessage = 'accept-invite-success-msg';

  const acceptInviteErrorTitle = 'accept-invite-error-title';
  const acceptInviteErrorMessage = 'accept-invite-error-msg';

  const declineInviteSuccessTitle = 'decline-invite-success-title';
  const declineInviteSuccessMessage = 'decline-invite-success-msg';

  const declineInviteErrorTitle = 'decline-invite-error-title';
  const declineInviteErrorMessage = 'decline-invite-error-msg';

  const acceptInvite = async (ws: Workspace) => {
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

  const declineInvite = async (ws: Workspace) => {
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
        <div
          className="flex cursor-pointer items-center justify-center rounded border p-1 font-semibold text-foreground transition duration-300 hover:bg-foreground/5"
          onClick={() => declineInvite(ws)}
        >
          {declineInviteLabel}
        </div>

        <div
          className="flex flex-1 cursor-pointer items-center justify-center rounded border p-1 font-semibold text-foreground transition duration-300 hover:bg-foreground/5"
          onClick={() => acceptInvite(ws)}
        >
          {acceptInviteLabel}
        </div>
      </div>
    </div>
  );
};

export default WorkspaceInviteSnippet;
