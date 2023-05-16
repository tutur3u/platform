import moment from 'moment';
import { getLabel } from '../../utils/audit-helper';
import { AuditLog } from '../../types/primitives/AuditLog';
import { User } from '../../types/primitives/User';
import useTranslation from 'next-translate/useTranslation';
import 'moment/locale/vi';

interface Props {
  data: AuditLog;
  isLoading: boolean;
  hasActor: boolean;
  actor?: User;
}

const AuditLabel = ({ data, isLoading, hasActor, actor }: Props) => {
  const { t, lang } = useTranslation('ws-activities');

  const label = getLabel(t, data);

  const fullLabel = isLoading ? t('common:loading') : label.trim();

  const localizedMoment = moment(data.ts).locale(lang);
  const relativeTime = localizedMoment.fromNow();

  return (
    <>
      <div className="font-semibold tracking-wide">
        {hasActor ? (
          actor && actor?.display_name ? (
            <span className="text-zinc-200">{actor.display_name}</span>
          ) : (
            '...'
          )
        ) : null}

        <span className="text-zinc-700 dark:text-zinc-400">
          {' '}
          {hasActor
            ? fullLabel
            : /* Capitalize the first letter of the sentence */
              fullLabel.charAt(0).toUpperCase() + fullLabel.slice(1)}
        </span>
      </div>
      <div className="line-clamp-1 py-1 text-zinc-500">{relativeTime}</div>
    </>
  );
};

export default AuditLabel;
