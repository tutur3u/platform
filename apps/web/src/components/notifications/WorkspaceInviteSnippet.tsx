import { SparklesIcon } from '@heroicons/react/24/solid';
import moment from 'moment';
import { Workspace } from '../../types/primitives/Workspace';

interface Props {
  ws: Workspace;
  onAccept?: (ws: Workspace) => void;
  onDecline?: (ws: Workspace) => void;
}

const WorkspaceInviteSnippet = ({ ws, onAccept, onDecline }: Props) => {
  return (
    <div className="max-w-xl rounded-lg bg-zinc-900 p-8">
      <div className="cursor-default font-semibold transition duration-150">
        <span className="text-zinc-500">You have been invited to join </span>
        {ws?.name || `Unnamed Workspace`}{' '}
        {ws?.id === '00000000-0000-0000-0000-000000000000' && (
          <SparklesIcon className="inline-block h-5 w-5 text-yellow-300" />
        )}
        {ws?.created_at ? (
          <>
            {' • '}
            <span className="text-zinc-400">
              {moment(ws.created_at).fromNow()}
            </span>
          </>
        ) : null}
      </div>
      <div className="mt-2 grid gap-4 md:grid-cols-2">
        {onDecline ? (
          <div
            className="flex cursor-pointer items-center justify-center rounded bg-zinc-300/10 p-2 font-semibold text-zinc-300 transition duration-300 hover:bg-red-300/30 hover:text-red-300"
            onClick={() => onDecline(ws)}
          >
            Decline invitation
          </div>
        ) : null}

        {onAccept ? (
          <div
            className="flex flex-1 cursor-pointer items-center justify-center rounded bg-zinc-300/10 p-2 font-semibold text-zinc-300 transition duration-300 hover:bg-green-300/30 hover:text-green-300"
            onClick={() => onAccept(ws)}
          >
            Accept invitation
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default WorkspaceInviteSnippet;
