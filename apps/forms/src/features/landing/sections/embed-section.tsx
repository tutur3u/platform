import { getMarketingAccent, SectionShell } from '@tuturuuu/ui/marketing';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { LANDING_EMBED_MODES } from '../landing-config';
import { EmbedPreview, type EmbedPreviewMode } from './embed-preview';

const SNIPPET = `<script src="https://forms.tuturuuu.com/embed.js" async></script>
<div
  data-tuturuuu-form="YOUR_SHARE_CODE"
  data-mode="popup"
></div>`;

/**
 * Embed modes.
 *
 * Each card pairs a drawn preview with its copy, so the difference between a
 * slider and a side tab is visible rather than described. The snippet below is
 * the real embed contract — one script tag plus data attributes.
 */
export function EmbedSection() {
  const t = useTranslations('forms.landing.embed');

  return (
    <SectionShell
      bloom="cyan"
      eyebrow={t('eyebrow')}
      id="embed"
      index="05"
      subtitle={t('subtitle')}
      title={t('title')}
      width="wide"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LANDING_EMBED_MODES.map((mode) => {
          const tokens = getMarketingAccent(mode.accent);
          const Icon = mode.icon;

          return (
            <div
              className="group relative overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-5 transition-all duration-500 hover:-translate-y-1 hover:border-foreground/15"
              key={mode.key}
            >
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent to-transparent opacity-40 transition-opacity duration-500 group-hover:opacity-100',
                  tokens.rule
                )}
              />

              <EmbedPreview
                borderClassName={tokens.border}
                mode={mode.key as EmbedPreviewMode}
                surfaceClassName={tokens.soft}
                tintClassName={tokens.solid}
              />

              <div className="mt-4 flex items-center gap-2">
                <Icon className={cn('h-4 w-4 shrink-0', tokens.text)} />
                <h3 className="font-display font-semibold text-[0.95rem] tracking-[-0.01em]">
                  {t(`modes.${mode.key}.title`)}
                </h3>
              </div>
              <p className="mt-2 text-foreground/50 text-xs leading-relaxed">
                {t(`modes.${mode.key}.description`)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-[1fr_1.2fr] lg:items-center">
        <div>
          <h3 className="font-display font-semibold text-xl tracking-[-0.02em]">
            {t('snippet_heading')}
          </h3>
          <p className="mt-3 text-foreground/50 text-sm leading-relaxed">
            {t('snippet_description')}
          </p>
        </div>
        <pre className="overflow-x-auto rounded-2xl border border-foreground/[0.08] bg-foreground/[0.03] p-5 font-mono-ui text-[0.75rem] text-foreground/70 leading-relaxed">
          <code>{SNIPPET}</code>
        </pre>
      </div>
    </SectionShell>
  );
}
