import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Divider, TextInput } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import SettingItemCard from '../../../../components/settings/SettingItemCard';
import UserGroupCreateModal from '../../../../components/loaders/users/groups/UserGroupCreateModal';
import useTranslation from 'next-translate/useTranslation';

export const getServerSideProps = enforceHasWorkspaces;

const NewRolePage: PageWithLayoutProps = () => {
  const { t } = useTranslation('ws-user-groups-details');

  const usersLabel = t('sidebar-tabs:users');
  const groupsLabel = t('workspace-users-tabs:groups');
  const createNewGroupLabel = t('create-new-group');
  const untitledLabel = t('common:untitled');

  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || untitledLabel,
              href: `/${ws.id}`,
            },
            { content: usersLabel, href: `/${ws.id}/users` },
            {
              content: groupsLabel,
              href: `/${ws.id}/users/groups`,
            },
            {
              content: createNewGroupLabel,
              href: `/${ws.id}/users/groups/new`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [
    ws,
    usersLabel,
    groupsLabel,
    untitledLabel,
    createNewGroupLabel,
    setRootSegment,
  ]);

  const [name, setName] = useState<string>('');

  const hasRequiredFields = () => name.length > 0;

  const showLoaderModal = () => {
    if (!ws) return;
    openModal({
      title: <div className="font-semibold">{createNewGroupLabel}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <UserGroupCreateModal
          wsId={ws.id}
          group={{
            name,
          }}
        />
      ),
    });
  };

  return (
    <>
      <HeaderX label={`${createNewGroupLabel} – ${usersLabel}`} />
      <div className="mt-2 flex min-h-full w-full flex-col ">
        <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
          <div className="flex items-end justify-end">
            <button
              className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
                hasRequiredFields()
                  ? 'hover:bg-blue-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={hasRequiredFields() ? showLoaderModal : undefined}
            >
              {t('common:create')}
            </button>
          </div>
        </div>

        <Divider className="my-4" />
        <div className="grid h-fit gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="col-span-full">
            <div className="text-2xl font-semibold">{t('basic-info')}</div>
            <Divider className="my-2" variant="dashed" />
          </div>

          <SettingItemCard
            title={t('name')}
            description={t('name-description')}
          >
            <TextInput
              placeholder={t('enter-name')}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
            />
          </SettingItemCard>
        </div>
      </div>
    </>
  );
};

NewRolePage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewRolePage;
