import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceHomePage({ params }: Props) {
  const { wsId } = await params;
  const ws = await getWorkspace(wsId);
  const t = await getTranslations('ws-home');

  const homeLabel = t('home');

  return (
    <div className="rounded-lg border bg-foreground/5 p-4">
      <h1 className="text-2xl font-bold">{homeLabel}</h1>
      <p className="text-foreground/80">
        {t('description_p1')}{' '}
        <span className="font-semibold text-foreground">
          {ws?.name || 'Unnamed Workspace'}
        </span>{' '}
        {t('description_p2')}
      </p>
    </div>
  );
}
