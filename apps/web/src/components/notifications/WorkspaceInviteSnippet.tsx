'use client';

import moment from 'moment';
import { Workspace } from '../../types/primitives/Workspace';
import useTranslation from 'next-translate/useTranslation';
import { mutate } from 'swr';
import { showNotification } from '@mantine/notifications';
import 'moment/locale/vi';

interface Props {
  ws: Workspace;
  transparent?: boolean;
}

const WorkspaceInviteSnippet = ({ ws, transparent = true }: Props) => {
  const { t, lang } = useTranslation('invite');

  const creationDate = moment(ws?.created_at)
    .locale(lang)
    .fromNow();

  const invitedTo = t('invited-to');

  const declineInviteLabel = t('decline-invite');
  const acceptInviteLabel = t('accept-invite');

  const acceptInviteSuccessTitle = t('invite:accept-invite-success-title');
  const acceptInviteSuccessMessage = t('invite:accept-invite-success-msg');

  const acceptInviteErrorTitle = t('invite:accept-invite-error-title');
  const acceptInviteErrorMessage = t('invite:accept-invite-error-msg');

  const declineInviteSuccessTitle = t('invite:decline-invite-success-title');
  const declineInviteSuccessMessage = t('invite:decline-invite-success-msg');

  const declineInviteErrorTitle = t('invite:decline-invite-error-title');
  const declineInviteErrorMessage = t('invite:decline-invite-error-msg');

  const acceptInvite = async (ws: Workspace) => {
    const response = await fetch(`/api/workspaces/${ws.id}/invites`, {
      method: 'POST',
    });

    if (response.ok) {
      mutate('/api/workspaces/invites');
      mutate('/api/workspaces/current');
      showNotification({
        title: acceptInviteSuccessTitle,
        message: acceptInviteSuccessMessage,
        color: 'teal',
      });
    } else {
      showNotification({
        title: acceptInviteErrorTitle,
        message: acceptInviteErrorMessage,
        color: 'red',
      });
    }
  };

  const declineInvite = async (ws: Workspace) => {
    const response = await fetch(`/api/workspaces/${ws.id}/invites`, {
      method: 'DELETE',
    });

    if (response.ok) {
      mutate('/api/workspaces/invites');
      showNotification({
        title: declineInviteSuccessTitle,
        message: declineInviteSuccessMessage,
        color: 'teal',
      });
    } else {
      showNotification({
        title: declineInviteErrorTitle,
        message: declineInviteErrorMessage,
        color: 'red',
      });
    }
  };

  return (
    <div
      className={`rounded-lg border p-4 ${
        transparent
          ? 'border-zinc-300/10 bg-zinc-300/5'
          : 'border-zinc-300/10 bg-zinc-900'
      }`}
    >
      <div className="cursor-default font-semibold transition duration-150">
        <span className="text-zinc-300/60">{invitedTo} </span>
        <span className="text-zinc-200">{ws?.name || `Unnamed Workspace`}</span>
        {ws?.created_at ? (
          <span className="font-normal text-zinc-300/60">
            {' '}
            • {creationDate}
          </span>
        ) : null}
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div
          className="flex cursor-pointer items-center justify-center rounded border border-zinc-300/10 bg-zinc-300/5 p-1 font-semibold text-zinc-300 transition duration-300 hover:border-red-300/10 hover:bg-red-300/10 hover:text-red-300"
          onClick={() => declineInvite(ws)}
        >
          {declineInviteLabel}
        </div>

        <div
          className="flex flex-1 cursor-pointer items-center justify-center rounded border border-zinc-300/10 bg-zinc-300/5 p-1 font-semibold text-zinc-300 transition duration-300 hover:border-green-300/10 hover:bg-green-300/10 hover:text-green-300"
          onClick={() => acceptInvite(ws)}
        >
          {acceptInviteLabel}
        </div>
      </div>
    </div>
  );
};

export default WorkspaceInviteSnippet;
