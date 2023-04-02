import { Divider, Popover } from '@mantine/core';
import SidebarButton from '../SidebarButton';
import { openModal } from '@mantine/modals';
import WorkspaceEditForm from '../../forms/WorkspaceEditForm';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import {
  BanknotesIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  PlusIcon,
  Squares2X2Icon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import useTranslation from 'next-translate/useTranslation';
import TeamEditForm from '../../forms/TeamEditForm';

interface Props {
  sidebarOpened: boolean;
  hasWorkspace: boolean;
}

const CreateNewButton = ({ sidebarOpened, hasWorkspace = false }: Props) => {
  const [newPopover, setNewPopover] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        setIsMobile(window.innerWidth < 768);
      };
      window.addEventListener('resize', handleResize);
      handleResize();
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const { createWorkspace, createTeam } = useWorkspaces();

  const showEditWorkspaceModal = () => {
    openModal({
      title: <div className="font-semibold">New workspace</div>,
      centered: true,
      children: <WorkspaceEditForm onSubmit={createWorkspace} />,
    });
  };

  const showTeamEditForm = () => {
    openModal({
      title: <div className="font-semibold">Create new team</div>,
      centered: true,
      children: <TeamEditForm onSubmit={createTeam} />,
    });
  };

  const { t } = useTranslation('sidebar-tabs');

  const newLabel = t('new');

  const newWs = t('new-ws');
  const newTeam = t('new-team');
  const newTask = t('new-task');
  const newNote = t('new-note');
  const newTransaction = t('new-transaction');
  const invitePeople = t('invite-people');

  return (
    <Popover
      opened={newPopover}
      onChange={setNewPopover}
      width={200}
      offset={16}
      position={isMobile ? 'bottom-start' : 'right'}
      positionDependencies={[isMobile]}
    >
      <Popover.Target>
        <div className="mx-2">
          <SidebarButton
            label={newLabel}
            onClick={() => setNewPopover((o) => !o)}
            isActive={newPopover}
            activeIcon={<PlusIcon className="w-5" />}
            showLabel={sidebarOpened}
            showTooltip={!sidebarOpened && !newPopover}
            className="w-full"
          />
        </div>
      </Popover.Target>

      <Popover.Dropdown className="mt-2 grid gap-1 p-1">
        <SidebarButton
          onClick={() => {
            setNewPopover(false);
            showEditWorkspaceModal();
          }}
          activeIcon={<BuildingOffice2Icon className="w-5" />}
          label={newWs}
          left
        />

        <Divider />

        {hasWorkspace && (
          <SidebarButton
            onClick={() => {
              setNewPopover(false);
              showTeamEditForm();
            }}
            activeIcon={<Squares2X2Icon className="w-5" />}
            label={newTeam}
            left
          />
        )}
        <SidebarButton
          onClick={() => setNewPopover(false)}
          activeIcon={<CheckCircleIcon className="w-5" />}
          label={newTask}
          left
          disabled
        />
        <SidebarButton
          onClick={() => setNewPopover(false)}
          activeIcon={<ClipboardDocumentListIcon className="w-5" />}
          label={newNote}
          left
          disabled
        />
        <SidebarButton
          onClick={() => setNewPopover(false)}
          activeIcon={<BanknotesIcon className="w-5" />}
          label={newTransaction}
          left
          disabled
        />

        {hasWorkspace && (
          <>
            <Divider />
            <SidebarButton
              onClick={() => setNewPopover(false)}
              activeIcon={<UserPlusIcon className="w-5" />}
              label={invitePeople}
              left
              disabled
            />
          </>
        )}
      </Popover.Dropdown>
    </Popover>
  );
};

export default CreateNewButton;
