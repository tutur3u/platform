import { Divider, TextInput } from '@mantine/core';
import moment from 'moment';
import { useRouter } from 'next/router';
import { ChangeEvent, ReactElement, useEffect, useState } from 'react';
import useSWR, { mutate } from 'swr';
import NestedLayout from '../../components/layouts/NestedLayout';
import { useSegments } from '../../hooks/useSegments';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import HeaderX from '../../components/metadata/HeaderX';
import { enforceHasWorkspaces } from '../../utils/serverless/enforce-has-workspaces';
import useTranslation from 'next-translate/useTranslation';
import 'moment/locale/vi';

export const getServerSideProps = enforceHasWorkspaces;

const WorkspaceSettingsPage = () => {
  const { t, lang } = useTranslation('ws-settings');

  const loadingLabel = t('common:loading');
  const settingsLabel = t('common:settings');

  const router = useRouter();
  const { wsId } = router.query;

  const { updateWorkspace, deleteWorkspace } = useWorkspaces();

  const { data: ws, error } = useSWR(`/api/workspaces/${wsId}`);
  const isLoading = !ws && !error;

  const { setRootSegment } = useSegments();

  const [name, setName] = useState(ws?.name);

  useEffect(() => {
    setName(ws?.name);
    setRootSegment(
      wsId
        ? [
            {
              content: ws?.name ?? loadingLabel,
              href: `/${wsId}`,
            },
            {
              content: settingsLabel,
              href: `/${wsId}/settings`,
            },
          ]
        : []
    );
  }, [setRootSegment, wsId, loadingLabel, settingsLabel, ws?.name]);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (isLoading) return <div>{loadingLabel}</div>;

  const isSystemWs = wsId === '00000000-0000-0000-0000-000000000000';

  const handleSave = async () => {
    setIsSaving(true);

    if (isSystemWs) {
      setIsSaving(false);
      return;
    }

    if (!updateWorkspace || !ws) {
      setIsSaving(false);
      throw new Error('Failed to update workspace');
    }

    await updateWorkspace(
      {
        id: ws.id,
        name,
      },
      {
        onSuccess: () => {
          setRootSegment(
            wsId
              ? [
                  {
                    content: name,
                    href: `/workspaces/${wsId}`,
                  },
                  {
                    content: 'Settings',
                    href: `/workspaces/${wsId}/settings`,
                  },
                ]
              : []
          );

          mutate('/api/workspaces/current');
          mutate(`/api/workspaces/${wsId}`);
        },
        onCompleted: () => setIsSaving(false),
      }
    );
  };

  const handleDelete = async () => {
    setIsDeleting(true);

    if (isSystemWs) {
      setIsDeleting(false);
      return;
    }

    if (!deleteWorkspace || !ws) {
      setIsDeleting(false);
      throw new Error('Failed to delete workspace');
    }

    await deleteWorkspace(ws.id, {
      onSuccess: () => {
        mutate('/api/workspaces/current');
        router.push('/onboarding');
      },
      onCompleted: () => setIsDeleting(false),
    });
  };

  const localizedMoment = ws?.created_at
    ? moment(ws.created_at).locale(lang)
    : null;
  const relativeTime = localizedMoment?.fromNow() || t('common:loading');

  return (
    <div className="pb-20">
      <HeaderX label={`${settingsLabel} – ${ws?.name}`} />

      {wsId && (
        <>
          <div className="rounded-lg bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">{settingsLabel}</h1>
            <p className="text-zinc-400">{t('description')}</p>
          </div>
          <Divider className="my-4" />
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
          <div className="mb-1 text-2xl font-bold">{t('basic_info')}</div>
          <div className="mb-4 font-semibold text-zinc-500">
            {t('basic_info_description')}
          </div>

          <div className="grid max-w-xs gap-2">
            <TextInput
              label={t('name')}
              placeholder={ws?.name || name || t('name_placeholder')}
              value={name}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setName(e.currentTarget.value)
              }
              disabled={isSystemWs}
            />
          </div>

          <div className="mt-8 border-t border-zinc-700/70 pt-4 text-zinc-500">
            {t('created_at')}{' '}
            <span className="font-semibold text-zinc-300">{relativeTime}</span>.
          </div>

          <div className="h-full" />

          <button
            onClick={
              isSystemWs || isSaving || name === ws?.name
                ? undefined
                : handleSave
            }
            className={`${
              isSystemWs || isSaving || name === ws?.name
                ? 'cursor-not-allowed opacity-50'
                : 'hover:border-blue-300/30 hover:bg-blue-300/20'
            } col-span-full mt-8 flex w-full items-center justify-center rounded-lg border border-blue-300/20 bg-blue-300/10 p-2 font-semibold text-blue-300 transition lg:text-xl`}
          >
            {isSaving ? t('common:saving') : t('common:save')}
          </button>
        </div>

        <div className="flex flex-col rounded-lg border border-zinc-800/80 bg-[#19191d] p-4">
          <div className="mb-1 text-2xl font-bold">{t('security')}</div>
          <div className="mb-4 font-semibold text-zinc-500">
            {t('security_description')}
          </div>

          <div className="grid h-full items-end gap-4 text-center xl:grid-cols-2">
            <button
              onClick={isSystemWs ? undefined : handleDelete}
              className={`${
                isSystemWs
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:border-red-300/30 hover:bg-red-300/20'
              } col-span-full mt-8 flex w-full items-center justify-center rounded-lg border border-red-300/20 bg-red-300/10 p-2 font-semibold text-red-300 transition lg:text-xl`}
            >
              {isDeleting ? t('deleting') : t('delete')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

WorkspaceSettingsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="workspace">{page}</NestedLayout>;
};

export default WorkspaceSettingsPage;
