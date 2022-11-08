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
    <div className="p-8 bg-zinc-900 rounded-lg max-w-xl">
      <div className="font-semibold transition duration-150 cursor-default">
        <span className="text-zinc-500">You have been invited to join </span>
        {org?.name || `Unnamed organization`}{' '}
        {org?.id === '00000000-0000-0000-0000-000000000000' && (
          <SparklesIcon className="inline-block w-5 h-5 text-yellow-300" />
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
      <div className="mt-2 grid md:grid-cols-2 gap-4">
        {onDecline ? (
          <div
            className="p-2 flex justify-center items-center font-semibold rounded bg-zinc-300/10 hover:bg-red-300/30 text-zinc-300 hover:text-red-300 cursor-pointer transition duration-300"
            onClick={() => onDecline(org)}
          >
            Decline invitation
          </div>
        ) : null}

        {onAccept ? (
          <div
            className="p-2 flex-1 flex justify-center items-center font-semibold rounded bg-zinc-300/10 hover:bg-green-300/30 text-zinc-300 hover:text-green-300 cursor-pointer transition duration-300"
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
