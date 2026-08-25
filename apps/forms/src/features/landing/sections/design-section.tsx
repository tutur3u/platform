import { SectionShell } from '@tuturuuu/ui/marketing';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  FORM_ACCENT_BADGE_CLASSES,
  FORM_THEME_PRESETS,
} from '@/features/forms/theme';

/** Presets shown as swatch cards — the same ones the studio ships. */
const SHOWCASE_PRESETS = FORM_THEME_PRESETS.slice(0, 10);

const SURFACE_KEYS = ['paper', 'glass', 'panel'] as const;
const CONTROL_KEYS = ['fonts', 'density', 'typography', 'cover'] as const;

/**
 * Theming.
 *
 * The swatch grid is generated from `FORM_THEME_PRESETS`, so the landing page
 * can never advertise a palette the studio no longer ships — adding a preset
 * adds it here automatically.
 */
export function DesignSection() {
  const t = useTranslations('forms.landing.design');

  return (
    <SectionShell
      bloom="pink"
      eyebrow={t('eyebrow')}
      id="design"
      index="04"
      subtitle={t('subtitle')}
      title={t('title')}
      width="wide"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {SHOWCASE_PRESETS.map((preset) => (
          <div
            className="group relative overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-4 transition-all duration-500 hover:-translate-y-1 hover:border-foreground/15"
            key={preset.id}
          >
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  'h-6 w-6 rounded-full',
                  FORM_ACCENT_BADGE_CLASSES[preset.accentColor]
                )}
              />
              <span
                aria-hidden
                className={cn(
                  'h-3 w-3 rounded-full opacity-60',
                  FORM_ACCENT_BADGE_CLASSES[preset.accentColor]
                )}
              />
              <span
                aria-hidden
                className={cn(
                  'h-2 w-2 rounded-full opacity-30',
                  FORM_ACCENT_BADGE_CLASSES[preset.accentColor]
                )}
              />
            </div>
            <p className="mt-4 truncate font-display font-medium text-sm tracking-[-0.01em]">
              {preset.name}
            </p>
            <p className="mt-1 truncate font-mono-ui text-[0.6rem] text-foreground/35 uppercase tracking-[0.14em]">
              {t(`surfaces.${preset.surfaceStyle}`)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-6">
          <h3 className="font-display font-semibold text-lg tracking-[-0.01em]">
            {t('surface_heading')}
          </h3>
          <p className="mt-2 text-foreground/50 text-sm leading-relaxed">
            {t('surface_description')}
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {SURFACE_KEYS.map((key) => (
              <div
                className="rounded-xl border border-foreground/[0.07] bg-background/50 px-3 py-4 text-center"
                key={key}
              >
                <p className="font-mono-ui text-[0.6rem] text-foreground/40 uppercase tracking-[0.14em]">
                  {t(`surfaces.${key}`)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-6">
          <h3 className="font-display font-semibold text-lg tracking-[-0.01em]">
            {t('controls_heading')}
          </h3>
          <p className="mt-2 text-foreground/50 text-sm leading-relaxed">
            {t('controls_description')}
          </p>
          <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {CONTROL_KEYS.map((key) => (
              <li
                className="flex items-start gap-2.5 text-foreground/60 text-sm"
                key={key}
              >
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-dynamic-pink"
                />
                {t(`controls.${key}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SectionShell>
  );
}
