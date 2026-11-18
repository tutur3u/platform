'use client';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { MiraMark } from './mira-mark';

type Source = 'chat' | 'live';
type Action = 'draft' | 'refine' | 'summarize';

/**
 * Mira's caret and live selection come from the collaboration caret renderer,
 * which accepts only a hex color. These overrides re-tint Mira's caret, label
 * and selection with the purple token so both themes keep their contrast.
 */
export const MIRA_CARET_SURFACE_CLASS_NAME = cn(
  '[&_.collaboration-carets__caret[data-user-id=mira]]:border-l-dynamic-purple!',
  '[&_.collaboration-carets__caret[data-user-id=mira]]:animate-pulse',
  '[&_.collaboration-carets__caret[data-user-id=mira]]:motion-reduce:animate-none',
  '[&_.collaboration-carets__label[data-user-id=mira]]:bg-dynamic-purple!',
  '[&_.collaboration-carets__label[data-user-id=mira]]:text-background!',
  '[&_.collaboration-carets__label[data-user-id=mira]]:rounded-[10px_10px_10px_3px]!',
  '[&_.collaboration-carets__label[data-user-id=mira]]:px-2!',
  '[&_.collaboration-carets__label[data-user-id=mira]]:font-extrabold',
  '[&_.collaboration-carets__selection[data-user-id=mira]]:rounded-[3px]',
  '[&_.collaboration-carets__selection[data-user-id=mira]]:bg-dynamic-purple/20!',
  '[&_.collaboration-carets__selection[data-user-id=mira]]:shadow-[inset_0_-2px_0_color-mix(in_srgb,var(--color-dynamic-purple)_60%,transparent)]'
);

/** Reusable in participant lists and tab switchers wherever Mira is present. */
export function MiraDocumentPresenceChip({
  source,
  className,
}: {
  source: Source;
  className?: string;
}) {
  const t = useTranslations('meet.collaboration');
  return (
    <span
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-dynamic-purple/35 bg-dynamic-purple/10 pr-2.5 pl-0.5 font-extrabold text-dynamic-purple text-xs',
        className
      )}
      data-testid="mira-document-chip"
    >
      <MiraMark size={24} className="rounded-lg" />
      {t(source === 'live' ? 'mira_source_live' : 'mira_source_chat')}
    </span>
  );
}

/** Badge on whichever tab Mira has open; the halo is static under reduced motion. */
export function MiraTabDot({ className }: { className?: string }) {
  const t = useTranslations('meet.collaboration');
  return (
    <span
      role="img"
      aria-label={t('mira_tab_open')}
      title={t('mira_tab_open')}
      className={cn('relative inline-flex size-4 shrink-0', className)}
    >
      <MiraMark size={16} className="rounded-[5px]" />
      <span
        aria-hidden="true"
        className="absolute -inset-0.75 animate-pulse rounded-lg border-[1.5px] border-dynamic-purple opacity-75 motion-reduce:animate-none"
      />
    </span>
  );
}

function LiveDot() {
  return (
    <span aria-hidden="true" className="relative inline-flex size-2 shrink-0">
      <span className="absolute inset-0 animate-ping rounded-full bg-dynamic-purple/60 motion-reduce:hidden" />
      <span className="relative size-2 rounded-full bg-dynamic-purple motion-reduce:border-2 motion-reduce:border-dynamic-purple motion-reduce:bg-transparent" />
    </span>
  );
}

const statusClassName =
  'inline-flex min-h-7 min-w-0 max-w-full items-center gap-2 rounded-full border border-dynamic-purple/25 bg-dynamic-purple/10 py-1 pr-3 pl-1.5 font-extrabold text-dynamic-purple text-xs';

/** Short live status: here it reads as activity, elsewhere it jumps to Mira's tab. */
export function MiraDocumentStatus({
  here,
  status,
  section,
  tabTitle,
  onJump,
}: {
  here: boolean;
  status: 'editing' | 'reviewing';
  section?: string;
  tabTitle: string;
  onJump: () => void;
}) {
  const t = useTranslations('meet.collaboration');
  if (!here)
    return (
      <button
        type="button"
        onClick={onJump}
        className={cn(
          statusClassName,
          'cursor-pointer transition-colors hover:bg-dynamic-purple/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none'
        )}
      >
        <MiraMark size={19} className="rounded-md" />
        <span className="truncate">{t('mira_jump', { title: tabTitle })}</span>
      </button>
    );
  return (
    <output aria-live="polite" className={statusClassName}>
      <LiveDot />
      <span className="truncate">
        {status === 'reviewing'
          ? t('mira_reviewing')
          : section
            ? t('mira_editing_section', { section })
            : t('mira_editing')}
      </span>
    </output>
  );
}

export function MiraAttributionPill({
  source,
  action,
}: {
  source: Source;
  action: Action;
}) {
  const t = useTranslations('meet.collaboration');
  return (
    <span className="inline-flex h-6.5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-dynamic-purple/30 bg-card pr-2.5 pl-1 font-extrabold text-xs text-dynamic-purple">
      <MiraMark size={18} className="rounded-md" />
      {t('mira_attribution', { action, source })}
    </span>
  );
}
