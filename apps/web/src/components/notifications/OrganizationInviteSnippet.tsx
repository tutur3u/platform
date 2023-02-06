import { SparklesIcon } from '@heroicons/react/24/solid';
import moment from 'moment';
import { Organization } from '../../types/primitives/Organization';

interface Props {
  org: Organization;
  onAccept?: (org: Organization) => void;
  onDecline?: (org: Organization) => void;
}

const OrganizationInviteSnippet = ({ org, onAccept, onDecline }: Props) => {
  return (
    <div className="max-w-xl rounded-lg bg-zinc-900 p-8">
      <div className="cursor-default font-semibold transition duration-150">
        <span className="text-zinc-500">You have been invited to join </span>
        {org?.name || `Unnamed Organization`}{' '}
        {org?.id === '00000000-0000-0000-0000-000000000000' && (
          <SparklesIcon className="inline-block h-5 w-5 text-yellow-300" />
        )}
        {org?.created_at ? (
          <>
            {' • '}
            <span className="text-zinc-400">
              {moment(org.created_at).fromNow()}
            </span>
          </>
        ) : null}
      </div>
      <div className="mt-2 grid gap-4 md:grid-cols-2">
        {onDecline ? (
          <div
            className="flex cursor-pointer items-center justify-center rounded bg-zinc-300/10 p-2 font-semibold text-zinc-300 transition duration-300 hover:bg-red-300/30 hover:text-red-300"
            onClick={() => onDecline(org)}
          >
            Decline invitation
          </div>
        ) : null}

        {onAccept ? (
          <div
            className="flex flex-1 cursor-pointer items-center justify-center rounded bg-zinc-300/10 p-2 font-semibold text-zinc-300 transition duration-300 hover:bg-green-300/30 hover:text-green-300"
            onClick={() => onAccept(org)}
          >
            Accept invitation
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default OrganizationInviteSnippet;
