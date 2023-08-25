import useTranslation from 'next-translate/useTranslation';
import 'moment/locale/vi';
import FeatureToggles from './feature-toggles';
import BasicInfo from './basic-info';
import Security from './security';
import { Separator } from '@/components/ui/separator';
import { getWorkspace } from '@/lib/workspace-helper';
import { DEV_MODE } from '@/constants/common';

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

  const settingsLabel = t('common:settings');

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
