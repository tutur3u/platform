import type { AiStudioCatalogResource } from '@tuturuuu/internal-api/ai-studio';
import { getTranslations } from 'next-intl/server';
import { CatalogPanel } from '@/components/catalog-panel';
import { StudioPageShell } from '@/components/studio/studio-page-shell';
import { getAiStudioPageContext } from '@/lib/page-context';

/**
 * Prompts, agents and datasets are the same read-only catalog surface, so they
 * share one page body and differ only by resource and copy.
 */
export async function CatalogSection({
  resource,
  wsId,
}: {
  resource: AiStudioCatalogResource;
  wsId: string;
}) {
  const t = await getTranslations('ai-studio');
  const { workspaceId } = await getAiStudioPageContext(wsId);
  const title = t(resource);

  return (
    <StudioPageShell
      description={t(`${resource}-description` as Parameters<typeof t>[0])}
      eyebrow={t('build')}
      title={title}
    >
      <CatalogPanel
        resource={resource}
        title={title}
        workspaceId={workspaceId}
      />
    </StudioPageShell>
  );
}
