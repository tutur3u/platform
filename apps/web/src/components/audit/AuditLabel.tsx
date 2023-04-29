import moment from 'moment';
import { getLabel } from '../../utils/audit-helper';
import { AuditLog } from '../../types/primitives/AuditLog';
import { User } from '../../types/primitives/User';

interface Props {
  data: AuditLog;
  isLoading: boolean;
  hasActor: boolean;
  actor?: User;
}

const AuditLabel = ({ data, isLoading, hasActor, actor }: Props) => {
  const label = getLabel(data);

  const fullLabel = isLoading
    ? 'Loading...'
    : `${hasActor ? (actor ? actor.display_name : '...') : ''} ${label}`.trim();

  return (
    <>
      <div className="font-semibold tracking-wide">
        {/* Capitalize the first letter of the sentence */}
        {fullLabel.charAt(0).toUpperCase() + fullLabel.slice(1)}
      </div>
      <div className="line-clamp-1 pb-1 font-semibold text-zinc-400/70">
        {moment(data.ts).fromNow()}
      </div>
    </>
  );
};

export default AuditLabel;
