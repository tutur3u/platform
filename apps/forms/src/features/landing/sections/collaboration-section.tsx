import { SectionShell } from '@tuturuuu/ui/marketing';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { FeatureGrid } from '../feature-grid';
import { LANDING_COLLABORATION_FEATURES } from '../landing-config';

/** Stand-in initials for the presence rail — never real user data. */
const DEMO_EDITORS = [
  { id: 'a', initials: 'MK', tone: 'bg-dynamic-purple' },
  { id: 'b', initials: 'TL', tone: 'bg-dynamic-blue' },
  { id: 'c', initials: 'NP', tone: 'bg-dynamic-orange' },
] as const;

/** Live avatar rail exactly as the studio header renders it. */
function PresenceRail({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] px-4 py-3">
      <div className="flex -space-x-2">
        {DEMO_EDITORS.map((editor) => (
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full border-2 border-background font-medium text-[0.65rem] text-white',
              editor.tone
            )}
            key={editor.id}
          >
            {editor.initials}
          </span>
        ))}
      </div>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-dynamic-green opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-dynamic-green" />
      </span>
      <span className="text-foreground/55 text-sm">{label}</span>
    </div>
  );
}

/** Realtime multiplayer editing. */
export function CollaborationSection() {
  const t = useTranslations('forms.landing.collaborate');

  return (
    <SectionShell
      align="start"
      bloom="purple"
      eyebrow={t('eyebrow')}
      id="collaborate"
      index="06"
      subtitle={t('subtitle')}
      title={t('title')}
    >
      <PresenceRail label={t('presence_label')} />
      <FeatureGrid
        className="mt-4"
        columns={3}
        items={LANDING_COLLABORATION_FEATURES}
        namespace="forms.landing.collaborate.features"
      />
    </SectionShell>
  );
}
