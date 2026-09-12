import type { ArtifactPresentation } from '@tuturuuu/ai/workspace-artifacts';
import { Sparkles } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { artifactVisuals } from './mira-artifact-visuals';
import type { ArtifactKind } from './mira-workspace-state';

export function MiraArtifactContext({
  presentation,
  kind,
}: {
  presentation?: ArtifactPresentation;
  kind: ArtifactKind;
}) {
  const t = useTranslations('dashboard.mira_workspace');
  if (!presentation?.description && !presentation?.highlights?.length)
    return null;
  return (
    <aside
      className={`space-y-1.5 rounded-lg border border-border/50 p-2.5 ${artifactVisuals[kind].headerClass}`}
      aria-label={t('assistant_focus')}
    >
      <p className="flex items-center gap-1.5 font-medium text-[11px]">
        <Sparkles aria-hidden className="size-3" />
        {t('assistant_focus')}
      </p>
      {presentation.description && (
        <p className="text-xs leading-relaxed">{presentation.description}</p>
      )}
      {presentation.highlights?.length ? (
        <ul className="list-disc space-y-1 pl-3.5 text-muted-foreground text-xs">
          {[...new Set(presentation.highlights)].map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
