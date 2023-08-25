import useTranslation from 'next-translate/useTranslation';
import { DEV_MODE } from '../../../../constants/common';
import 'moment/locale/vi';
import { notFound, redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Workspace } from '@/types/primitives/Workspace';
import { cookies } from 'next/headers';
import FeatureToggles from './feature-toggles';
import BasicInfo from './basic-info';
import Security from './security';
import { Separator } from '@/components/ui/separator';

interface Props {
  params: {
    wsId: string;
  };
}

export default async function WorkspaceSettingsPage({
  params: { wsId },
}: Props) {
  const { t } = useTranslation('ws-settings');

  const settingsLabel = t('common:settings');

  const ws = await getWorkspace(wsId);

  return (
    <>
      <div className="rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900">
        <h1 className="text-2xl font-bold">{settingsLabel}</h1>
        <p className="text-zinc-700 dark:text-zinc-400">{t('description')}</p>
      </div>
      <Separator className="my-4" />

      <div className="grid gap-4 lg:grid-cols-2">
        <BasicInfo workspace={ws} />
        <Security workspace={ws} />

        {DEV_MODE && (
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
        )}
      </div>
    </>
  );
}

async function getWorkspace(id?: string | null) {
  if (!id) notFound();

  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, preset, created_at, workspace_members!inner(role)')
    .eq('id', id)
    .eq('workspace_members.user_id', user.id)
    .single();

  if (error) notFound();
  if (!data?.workspace_members[0]?.role) notFound();

  const ws = {
    ...data,
    role: data.workspace_members[0].role,
  };

  return ws as Workspace;
}
