import { getWorkspace } from '@/lib/workspace-helper';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  params: {
    wsId: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function WorkspaceHomePage({ params: { wsId } }: Props) {
  const { t } = useTranslation('ws-home');
  const ws = await getWorkspace(wsId);

  const homeLabel = t('home');

  return (
    <>
      <div className="bg-foreground/5 rounded-lg border p-4">
        <h1 className="text-2xl font-bold">{homeLabel}</h1>
        <p className="text-foreground/80">
          {t('description_p1')}{' '}
          <span className="text-foreground font-semibold">
            {ws?.name || 'Unnamed Workspace'}
          </span>{' '}
          {t('description_p2')}
        </p>
      </div>
    </>
  );
}
