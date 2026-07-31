import { BookOpen } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PlaygroundPanel } from '@/components/playground-panel';
import { StudioPageShell } from '@/components/studio/studio-page-shell';
import { getAiStudioPageContext } from '@/lib/page-context';

export default async function PlaygroundPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  const t = await getTranslations('ai-studio');
  const { canManageAiKeys, workspaceId } = await getAiStudioPageContext(wsId);

  return (
    <StudioPageShell
      actions={
        <Button asChild variant="outline">
          <Link href={`/${workspaceId}/developer-docs`}>
            <BookOpen className="mr-2 size-4" />
            {t('developer-docs')}
          </Link>
        </Button>
      }
      description={t('playground-description')}
      eyebrow={t('build')}
      title={t('playground')}
    >
      <PlaygroundPanel
        canManageAiKeys={canManageAiKeys}
        workspaceId={workspaceId}
      />
    </StudioPageShell>
  );
}
