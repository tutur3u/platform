import useTranslation from 'next-translate/useTranslation';
import SidebarLink from '../SidebarLink';
import {
  ArchiveBoxIcon,
  BanknotesIcon,
  BeakerIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  FingerPrintIcon,
  HomeIcon,
  RectangleStackIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { WorkspacePreset } from '../../../types/primitives/WorkspacePreset';

interface Props {
  wsId: string;
  wsPreset: WorkspacePreset;
  sidebarOpened: boolean;
}

const SidebarLinkList = ({ wsId, wsPreset, sidebarOpened }: Props) => {
  const { t } = useTranslation('sidebar-tabs');

  const home = t('home');
  const calendar = t('calendar');
  const tasks = t('tasks');
  const documents = t('documents');
  const users = t('users');
  const attendance = t('attendance');
  const healthcare = t('healthcare');
  const inventory = t('inventory');
  const classes = t('classes');
  const finance = t('finance');
  const activities = t('activities');

  return (
    <div className="mx-2 mb-2 flex flex-col gap-1">
      <SidebarLink
        href={`/${wsId}`}
        activeIcon={<HomeIcon className="w-5" />}
        label={home}
        showTooltip={!sidebarOpened}
        exactMatch
      />

      {(wsPreset === 'ALL' || wsPreset === 'GENERAL') && (
        <SidebarLink
          href={`/${wsId}/calendar`}
          activeIcon={<CalendarDaysIcon className="w-5" />}
          label={calendar}
          showTooltip={!sidebarOpened}
          disabled
        />
      )}

      {(wsPreset === 'ALL' || wsPreset === 'GENERAL') && (
        <SidebarLink
          href={`/${wsId}/tasks`}
          activeIcon={<CheckCircleIcon className="w-5" />}
          label={tasks}
          showTooltip={!sidebarOpened}
          disabled
        />
      )}

      {(wsPreset === 'ALL' || wsPreset === 'GENERAL') && (
        <SidebarLink
          href={`/${wsId}/documents`}
          activeIcon={<ClipboardDocumentListIcon className="w-5" />}
          label={documents}
          showTooltip={!sidebarOpened}
        />
      )}

      <SidebarLink
        href={`/${wsId}/users`}
        activeIcon={<UserGroupIcon className="w-5" />}
        label={users}
        showTooltip={!sidebarOpened}
      />

      <SidebarLink
        href={`/${wsId}/attendance`}
        activeIcon={<FingerPrintIcon className="w-5" />}
        label={attendance}
        showTooltip={!sidebarOpened}
        disabled
      />

      {(wsPreset === 'ALL' || wsPreset === 'PHARMACY') && (
        <SidebarLink
          href={`/${wsId}/healthcare`}
          activeIcon={<BeakerIcon className="w-5" />}
          label={healthcare}
          showTooltip={!sidebarOpened}
        />
      )}

      <SidebarLink
        href={`/${wsId}/inventory`}
        activeIcon={<ArchiveBoxIcon className="w-5" />}
        label={inventory}
        showTooltip={!sidebarOpened}
      />

      {(wsPreset === 'ALL' || wsPreset === 'EDUCATION') && (
        <SidebarLink
          href={`/${wsId}/classes`}
          activeIcon={<RectangleStackIcon className="w-5" />}
          label={classes}
          showTooltip={!sidebarOpened}
          disabled
        />
      )}

      <SidebarLink
        href={`/${wsId}/finance`}
        activeIcon={<BanknotesIcon className="w-5" />}
        label={finance}
        showTooltip={!sidebarOpened}
      />

      <SidebarLink
        href={`/${wsId}/activities`}
        activeIcon={<ClockIcon className="w-5" />}
        label={activities}
        showTooltip={!sidebarOpened}
        disabled
      />
    </div>
  );
};

export default SidebarLinkList;
