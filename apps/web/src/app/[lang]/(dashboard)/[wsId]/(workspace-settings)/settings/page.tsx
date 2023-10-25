import useTranslation from 'next-translate/useTranslation';
import BasicInfo from './basic-info';
import Security from './security';
import { Separator } from '@/components/ui/separator';
import { getWorkspace } from '@/lib/workspace-helper';
import { ROOT_WORKSPACE_ID } from '@/constants/common';
import { Database } from '@/types/supabase';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { WorkspaceSecret } from '@/types/primitives/WorkspaceSecret';
import { cookies } from 'next/headers';
import WorkspaceLogoSettings from './logo';
import WorkspaceAvatarSettings from './avatar';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId: string;
  };
}

export default async function WorkspaceSettingsPage({
  params: { wsId },
}: Props) {
  const { t } = useTranslation('ws-settings');

  const ws = await getWorkspace(wsId);
  const { data: secrets } = await getSecrets(wsId);

  const preventWorkspaceDeletion =
    secrets
      .find((s) => s.name === 'PREVENT_WORKSPACE_DELETION')
      ?.value?.toLowerCase() === 'true';

  const enableAvatar = Boolean(
    secrets.find((s) => s.name === 'ENABLE_AVATAR')?.value
  );

  const enableLogo = Boolean(
    secrets.find((s) => s.name === 'ENABLE_LOGO')?.value
  );

  const isRootWorkspace = ws?.id === ROOT_WORKSPACE_ID;
  const isWorkspaceOwner = ws?.role === 'OWNER';

  const enableSecurity =
    !isRootWorkspace && isWorkspaceOwner && !preventWorkspaceDeletion;

  const settingsLabel = t('common:settings');

  return (
    <>
      <div className="rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900">
        <h1 className="text-2xl font-bold">{settingsLabel}</h1>
        <p className="text-zinc-700 dark:text-zinc-400">{t('description')}</p>
      </div>
      <Separator className="my-4" />

      <div className="grid gap-4 lg:grid-cols-2">
        <BasicInfo
          workspace={ws}
          allowEdit={!isRootWorkspace && ws?.role !== 'MEMBER'}
        />

        {enableAvatar && (
          <WorkspaceAvatarSettings
            workspace={ws}
            allowEdit={ws?.role === 'OWNER'}
          />
        )}

        {enableLogo && (
          <WorkspaceLogoSettings
            workspace={ws}
            allowEdit={ws?.role === 'OWNER'}
          />
        )}

        {enableSecurity && <Security workspace={ws} />}

        {/* {DEV_MODE && (
          <>
            <Separator className="col-span-full" />

            <div className="col-span-full flex flex-col rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900">
              <div className="mb-1 text-2xl font-bold">{t('features')}</div>
              <div className="mb-4 font-semibold text-zinc-500">
                {t('features_description')}
              </div>

              <div className="grid h-full items-end gap-2 text-center md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <FeatureToggles />
              </div>
            </div>
          </>
        )} */}
      </div>
    </>
  );
}

async function getSecrets(wsId: string) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_secrets')
    .select('*', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .in('name', ['PREVENT_WORKSPACE_DELETION', 'ENABLE_AVATAR', 'ENABLE_LOGO']);

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: WorkspaceSecret[] };
}
