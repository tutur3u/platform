import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import { Divider, TextInput } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import SettingItemCard from '../../../../../components/settings/SettingItemCard';
import UserGroupEditModal from '../../../../../components/loaders/users/groups/UserGroupEditModal';
import UserGroupDeleteModal from '../../../../../components/loaders/users/groups/UserGroupDeleteModal';
import { useRouter } from 'next/router';
import { UserGroup } from '../../../../../types/primitives/UserGroup';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';
import { useAppearance } from '../../../../../hooks/useAppearance';

export const getServerSideProps = enforceHasWorkspaces;

const UserGroupSettingsPage: PageWithLayoutProps = () => {
  const { t } = useTranslation('ws-user-groups-details');

  const usersLabel = t('sidebar-tabs:users');
  const groupsLabel = t('workspace-users-tabs:groups');
  const settingsLabel = t('ws-user-groups-details-tabs:settings');
  const untitledLabel = t('common:untitled');

  const { setRootSegment } = useSegments();
  const { sidebar } = useAppearance();
  const { ws } = useWorkspaces();

  const router = useRouter();
  const { wsId, groupId } = router.query;

  const apiPath =
    wsId && groupId ? `/api/workspaces/${wsId}/users/groups/${groupId}` : null;

  const { data: group } = useSWR<UserGroup>(apiPath);

  useEffect(() => {
    setRootSegment(
      ws && group
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
              content: group?.name || untitledLabel,
              href: `/${ws.id}/users/groups/${group.id}`,
            },
            {
              content: settingsLabel,
              href: `/${ws.id}/users/groups/${group.id}/settings`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [
    ws,
    group,
    usersLabel,
    groupsLabel,
    settingsLabel,
    untitledLabel,
    setRootSegment,
  ]);

  const [name, setName] = useState<string>('');

  useEffect(() => {
    if (!group) return;
    setName(group?.name || '');
  }, [group]);

  const hasRequiredFields = () => name.length > 0;

  const showEditModal = () => {
    if (!group) return;
    if (typeof groupId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">{t('update-user-group')}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <UserGroupEditModal
          wsId={ws.id}
          group={{
            id: groupId,
            name,
          }}
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!group) return;
    if (typeof groupId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">{t('delete-user-group')}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <UserGroupDeleteModal wsId={ws.id} groupId={groupId} />,
    });
  };

  const reset = () => {
    if (!group) return;
    setName(group?.name || '');
  };

  const isDirty = () => {
    if (!group) return false;
    return name !== group?.name;
  };

  return (
    <>
      <HeaderX label={`${settingsLabel} – ${group?.name || untitledLabel}`} />
      <div className="flex min-h-full w-full flex-col ">
        {group && hasRequiredFields() && (
          <div
            className={`fixed inset-x-0 ${
              sidebar === 'open'
                ? 'mx-4 md:ml-72 md:mr-8 lg:ml-80 lg:mr-16 xl:ml-96 xl:mr-32'
                : 'mx-4 md:ml-24 md:mr-8 lg:ml-32 lg:mr-16 xl:mx-48'
            } bottom-0 z-[100] mx-4 mb-[4.5rem] flex flex-col items-center justify-between gap-y-4 rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 backdrop-blur transition-all duration-500 dark:border-zinc-300/10 dark:bg-zinc-900/80 md:mx-8 md:mb-4 md:flex-row lg:mx-16 xl:mx-32 ${
              isDirty() ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <div>{t('common:unsaved-changes')}</div>

            <div className="flex w-full items-center gap-4 md:w-fit">
              <button
                className={`w-full font-semibold text-zinc-700 transition dark:text-zinc-300 md:w-fit ${
                  isDirty()
                    ? ''
                    : 'pointer-events-none cursor-not-allowed opacity-50'
                }`}
                onClick={reset}
              >
                {t('common:reset')}
              </button>

              <button
                className={`w-full rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 md:w-fit ${
                  isDirty()
                    ? 'hover:bg-blue-300/20'
                    : 'pointer-events-none cursor-not-allowed opacity-50'
                }`}
                onClick={showEditModal}
              >
                {t('common:save')}
              </button>
            </div>
          </div>
        )}

        <div className="grid h-fit gap-4 pb-32 md:grid-cols-2 xl:grid-cols-3">
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

          <SettingItemCard
            title={t('security')}
            description={t('security-description')}
            onDelete={showDeleteModal}
          />
        </div>
      </div>
    </>
  );
};

UserGroupSettingsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="user_group_details">{page}</NestedLayout>;
};

export default UserGroupSettingsPage;
