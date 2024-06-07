import { User } from '@/types/primitives/User';
import { Workspace } from '@/types/primitives/Workspace';
import { AuditLog } from '@/types/primitives/audit-log';
import { getLabel } from '@/utils/audit-helper';
import moment from 'moment';
import 'moment/locale/vi';
import useTranslation from 'next-translate/useTranslation';
import useSWR from 'swr';

interface Props {
  data: AuditLog;
  isLoading: boolean;
  hasActor: boolean;
  actor?: User;
}

const AuditLabel = ({ data, isLoading, hasActor, actor }: Props) => {
  const { t, lang } = useTranslation('ws-activities');

  const wsId = data?.ws_id;
  const wsApiPath = wsId ? `/api/workspaces/${wsId}` : null;

  const { data: workspace } = useSWR<Workspace>(wsApiPath);

  const label = getLabel(t, data);
  const unnamedWorkspace = t('common:unnamed-workspace');

  const fullLabel = isLoading ? t('common:loading') : label.trim();

  const localizedMoment = moment(data.ts).locale(lang);
  const relativeTime = localizedMoment.fromNow();

  return (
    <>
      <div className="font-semibold tracking-wide">
        {hasActor ? (
          actor && actor?.display_name ? (
            <span className="text-zinc-900 dark:text-zinc-200">
              {actor.display_name}
            </span>
          ) : (
            '...'
          )
        ) : null}

        <span className="text-foreground/80 dark:text-zinc-400">
          {' '}
          {hasActor
            ? fullLabel.toLowerCase()
            : /* Capitalize the first letter of the sentence */
              fullLabel.charAt(0).toUpperCase() + fullLabel.slice(1)}
        </span>
      </div>
      <div className="line-clamp-1 pt-0.5 text-sm font-semibold text-blue-600 dark:text-blue-300">
        {relativeTime.charAt(0).toUpperCase() + relativeTime.slice(1)}
        {workspace ? (
          <span className="text-purple-600 dark:text-purple-300">
            {' '}
            • {workspace.name || unnamedWorkspace}
          </span>
        ) : (
          ''
        )}
      </div>
    </>
  );
};

export default AuditLabel;
