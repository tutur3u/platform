import moment from 'moment';
import { Workspace } from '../../types/primitives/Workspace';
import { Divider } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';
import 'moment/locale/vi';

interface Props {
  ws: Workspace;
  onAccept?: (ws: Workspace) => void;
  onDecline?: (ws: Workspace) => void;

  gray?: boolean;
}

const WorkspaceInviteSnippet = ({
  ws,
  onAccept,
  onDecline,
  gray = false,
}: Props) => {
  const { t, lang } = useTranslation('invite');

  const creationDate = moment(ws?.created_at).locale(lang).fromNow();

  const invitedTo = t('invited-to');

  const declineInvite = t('decline-invite');
  const acceptInvite = t('accept-invite');

  return (
    <div
      className={`rounded-lg border p-8 ${
        gray
          ? 'border-zinc-300/20 bg-zinc-300/10'
          : 'border-blue-300/20 bg-blue-300/10'
      }`}
    >
      {ws?.created_at ? (
        <>
          <div className="w-fit rounded border border-purple-300/10 bg-purple-300/10 px-4 py-0.5 text-purple-300">
            {creationDate}
          </div>
          <Divider className="my-2 border-blue-300/20" />
        </>
      ) : null}

      <div className="cursor-default font-semibold transition duration-150">
        <span className="text-zinc-300/60">{invitedTo} </span>
        <span className="text-zinc-200">{ws?.name || `Unnamed Workspace`}</span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {onDecline ? (
          <div
            className="flex cursor-pointer items-center justify-center rounded border border-zinc-300/10 bg-zinc-300/5 p-2 font-semibold text-zinc-300 transition duration-300 hover:border-red-300/10 hover:bg-red-300/10 hover:text-red-300"
            onClick={() => onDecline(ws)}
          >
            {declineInvite}
          </div>
        ) : null}

        {onAccept ? (
          <div
            className="flex flex-1 cursor-pointer items-center justify-center rounded border border-zinc-300/10 bg-zinc-300/5 p-2 font-semibold text-zinc-300 transition duration-300 hover:border-green-300/10 hover:bg-green-300/10 hover:text-green-300"
            onClick={() => onAccept(ws)}
          >
            {acceptInvite}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default WorkspaceInviteSnippet;
