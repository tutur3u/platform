import moment from 'moment';
import { Workspace } from '../../types/primitives/Workspace';
import { Divider } from '@mantine/core';

interface Props {
  ws: Workspace;
  onAccept?: (ws: Workspace) => void;
  onDecline?: (ws: Workspace) => void;
}

const WorkspaceInviteSnippet = ({ ws, onAccept, onDecline }: Props) => {
  return (
    <div className="rounded-lg border border-blue-300/20 bg-blue-300/5 p-8">
      {ws?.created_at ? (
        <>
          <div className="w-fit rounded border border-blue-300/20 bg-blue-300/10 px-2 py-0.5 text-blue-300">
            {moment(ws.created_at).fromNow()}
          </div>
          <Divider className="my-2 border-blue-300/20" />
        </>
      ) : null}

      <div className="cursor-default font-semibold transition duration-150">
        <span className="text-zinc-300/80">You have been invited to join </span>
        {ws?.name || `Unnamed Workspace`}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {onDecline ? (
          <div
            className="flex cursor-pointer items-center justify-center rounded border border-zinc-300/10 bg-zinc-300/5 p-2 font-semibold text-zinc-300 transition duration-300 hover:border-red-300/10 hover:bg-red-300/10 hover:text-red-300"
            onClick={() => onDecline(ws)}
          >
            Decline invitation
          </div>
        ) : null}

        {onAccept ? (
          <div
            className="flex flex-1 cursor-pointer items-center justify-center rounded border border-zinc-300/10 bg-zinc-300/5 p-2 font-semibold text-zinc-300 transition duration-300 hover:border-green-300/10 hover:bg-green-300/10 hover:text-green-300"
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
