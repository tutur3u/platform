import { Divider, Popover } from '@mantine/core';
import SidebarButton from '../SidebarButton';
import { openModal } from '@mantine/modals';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import {
  BanknotesIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  PlusIcon,
  ReceiptPercentIcon,
  Squares2X2Icon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import useTranslation from 'next-translate/useTranslation';
import TeamEditForm from '../../forms/TeamEditForm';
import SidebarLink from '../SidebarLink';
import { useAppearance } from '../../../hooks/useAppearance';

const CreateNewButton = () => {
  const { sidebar } = useAppearance();
  const isExpanded = sidebar === 'open';

  const [popover, setPopover] = useState(false);
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

  const { ws, createTeam } = useWorkspaces();

  // const showEditWorkspaceModal = () => {
  //   openModal({
  //     title: <div className="font-semibold">New workspace</div>,
  //     centered: true,
  //     children: <WorkspaceEditForm onSubmit={createWorkspace} />,
  //   });
  // };

  const showTeamEditForm = () => {
    openModal({
      title: <div className="font-semibold">Create new team</div>,
      centered: true,
      children: <TeamEditForm onSubmit={createTeam} />,
    });
  };

  const { t } = useTranslation('sidebar-tabs');

  const newLabel = t('new');

  // const newWs = t('new-ws');
  const newTeam = t('new-team');
  const newTask = t('new-task');
  const newNote = t('new-note');
  const newTransaction = t('new-transaction');
  const newInvoice = t('new-invoice');
  const invitePeople = t('invite-people');

  return (
    <Popover
      opened={popover}
      onChange={setPopover}
      width={200}
      offset={16}
      position={isMobile ? 'bottom-start' : 'right'}
      positionDependencies={[isMobile]}
    >
      <Popover.Target>
        <div className="mx-2">
          <SidebarButton
            label={newLabel}
            onClick={() => setPopover((o) => !o)}
            isActive={popover}
            activeIcon={<PlusIcon className="w-5" />}
            showLabel={isExpanded}
            showTooltip={!isExpanded && !popover}
            classNames={{
              root: 'w-full',
            }}
          />
        </div>
      </Popover.Target>

      <Popover.Dropdown className="mt-2 grid gap-1 p-1">
        {/* <SidebarButton
          onClick={() => {
            setPopover(false);
            showEditWorkspaceModal();
          }}
          activeIcon={<BuildingOffice2Icon className="w-5" />}
          label={newWs}
          left
        />

        <Divider /> */}

        {ws && (
          <SidebarButton
            onClick={() => {
              setPopover(false);
              showTeamEditForm();
            }}
            activeIcon={<Squares2X2Icon className="w-5" />}
            label={newTeam}
            left
          />
        )}

        <SidebarLink
          onClick={() => setPopover(false)}
          activeIcon={<CheckCircleIcon className="w-5" />}
          label={newTask}
          disabled
          left
        />

        <SidebarLink
          onClick={() => setPopover(false)}
          activeIcon={<ClipboardDocumentListIcon className="w-5" />}
          label={newNote}
          disabled
          left
        />

        <SidebarLink
          href={`/${ws?.id}/finance/transactions/new`}
          onClick={() => setPopover(false)}
          activeIcon={<BanknotesIcon className="w-5" />}
          label={newTransaction}
          left
        />

        <SidebarLink
          href={`/${ws?.id}/finance/invoices/new`}
          onClick={() => setPopover(false)}
          activeIcon={<ReceiptPercentIcon className="w-5" />}
          label={newInvoice}
          left
        />

        {ws && (
          <>
            <Divider />
            <SidebarLink
              href={`/${ws.id}/members`}
              onClick={() => setPopover(false)}
              activeIcon={<UserPlusIcon className="w-5" />}
              label={invitePeople}
              left
            />
          </>
        )}
      </Popover.Dropdown>
    </Popover>
  );
};

export default CreateNewButton;
