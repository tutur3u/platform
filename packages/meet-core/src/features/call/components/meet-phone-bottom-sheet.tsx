'use client';

import {
  Check,
  Clock,
  EyeOff,
  FileDiff,
  FileText,
  RotateCcw,
  Sparkles,
  X,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useEffect, useId, useState } from 'react';
import type { PhoneLiveSheetTab } from '../hooks/use-phone-call-ui';
import { MiraMark } from './mira-mark';
import { MiraAvatar } from './mira-profile';

export interface PhonePreviewTile {
  id: string;
  name: string;
  isMira?: boolean;
  subtitle?: string;
}

export interface PhonePollOption {
  id: string;
  label: string;
  votes: number;
}

export interface PhonePollData {
  id: string;
  question: string;
  timerLabel: string;
  anonymous?: boolean;
  multiSelect?: boolean;
  totalVotes: number;
  options: PhonePollOption[];
  selectedOptionIds?: string[];
  submitted?: boolean;
  miraSummary?: string;
}

export interface PhoneDocCollaborator {
  id: string;
  name: string;
  avatarUrl?: string;
  status?: string;
}

export interface PhoneDocItem {
  id: string;
  title: string;
  miraAttribution?: 'voice_live' | 'chat';
  miraEditSummary?: string;
  diffBefore?: string;
  diffAfter?: string;
}

export interface PhoneBottomSheetFrameProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  previewTiles?: [PhonePreviewTile, PhonePreviewTile] | PhonePreviewTile[];
  topBanner?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Reusable accessible mobile bottom sheet frame (Mockup 07, 390x844):
 * - Dimmed 2-tile call preview above the sheet
 * - `rounded-t-[28px]` slide-up sheet with `border-t` and `36x4px` grabber pill
 * - `role="dialog"`, `aria-modal="true"`, Escape key & backdrop dismiss
 */
export function PhoneBottomSheetFrame({
  open,
  onOpenChange,
  title,
  previewTiles,
  topBanner,
  children,
  className,
}: PhoneBottomSheetFrameProps) {
  const t = useTranslations('meet.call.phone');
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  const tiles = (previewTiles ?? []).slice(0, 2);

  return (
    <div
      data-testid="phone-sheet-backdrop-root"
      className="ttr-sorbet-font fixed inset-0 z-50 mx-auto flex max-w-[390px] flex-col justify-end"
    >
      {/* Dimmed backdrop + 2-tile call preview above */}
      <div
        data-testid="phone-sheet-backdrop"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />

      {tiles.length > 0 && (
        <div
          data-testid="phone-sheet-dimmed-preview"
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
          className="relative z-10 grid grid-cols-2 gap-2 px-3 pb-3 opacity-45"
        >
          {tiles.map((tile) => (
            <div
              key={tile.id}
              className="flex min-h-[76px] items-center gap-2.5 rounded-[18px] border border-border/60 bg-card/90 px-3 py-2 shadow-xs"
            >
              {tile.isMira ? (
                <MiraAvatar size={26} />
              ) : (
                <Avatar className="size-7">
                  <AvatarFallback className="font-semibold text-xs">
                    {tile.name.trim().slice(0, 1).toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground text-xs">
                  {tile.name}
                </p>
                {tile.subtitle && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {tile.subtitle}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="phone-bottom-sheet-dialog"
        className={cn(
          'phone-sheet-panel relative z-20 flex max-h-[82dvh] flex-col overflow-hidden rounded-t-[28px] border-t border-border/80 bg-popover text-popover-foreground shadow-lg motion-reduce:animate-none',
          className
        )}
      >
        {/* Grabber pill 36x4px */}
        <div className="flex justify-center pt-2.5 pb-1">
          <span
            aria-hidden="true"
            data-testid="phone-sheet-grabber"
            className="h-[4px] w-[36px] rounded-full bg-muted-foreground/35"
          />
        </div>

        {topBanner && <div className="px-4 pt-1 pb-2">{topBanner}</div>}

        <header className="flex items-center justify-between gap-2 px-4 pt-1 pb-3">
          <h2 id={titleId} className="font-semibold text-base text-foreground">
            {title}
          </h2>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t('close_sheet')}
            onClick={() => onOpenChange(false)}
            className="size-10 rounded-full"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {children}
        </div>
      </section>
    </div>
  );
}

export interface MeetPhoneBottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab?: PhoneLiveSheetTab;
  onTabChange?: (tab: PhoneLiveSheetTab) => void;
  previewTiles?: [PhonePreviewTile, PhonePreviewTile] | PhonePreviewTile[];
  poll: PhonePollData;
  onSubmitVote?: (optionIds: string[]) => void;
  docs: PhoneDocItem[];
  activeDocId?: string;
  onSelectDoc?: (docId: string) => void;
  collaborators?: PhoneDocCollaborator[];
  docsHasMiraDot?: boolean;
  onAcceptMiraEdit?: (docId: string) => void;
  onUndoMiraEdit?: (docId: string) => void;
  className?: string;
}

/**
 * Screen C (Mockup 07, 390x844): Bottom Sheet for Polls & Multi-Doc.
 */
export function MeetPhoneBottomSheet({
  open,
  onOpenChange,
  activeTab: controlledTab,
  onTabChange,
  previewTiles,
  poll,
  onSubmitVote,
  docs,
  activeDocId: controlledDocId,
  onSelectDoc,
  collaborators = [],
  docsHasMiraDot = true,
  onAcceptMiraEdit,
  onUndoMiraEdit,
  className,
}: MeetPhoneBottomSheetProps) {
  const t = useTranslations('meet.call.phone');
  const [internalTab, setInternalTab] = useState<PhoneLiveSheetTab>('poll');
  const activeTab = controlledTab ?? internalTab;

  const setTab = (next: PhoneLiveSheetTab) => {
    setInternalTab(next);
    onTabChange?.(next);
  };

  const [selectedOptions, setSelectedOptions] = useState<string[]>(
    poll.selectedOptionIds ?? []
  );
  const [hasSubmitted, setHasSubmitted] = useState(Boolean(poll.submitted));
  const [internalDocId, setInternalDocId] = useState<string>(docs[0]?.id ?? '');
  const [showDiff, setShowDiff] = useState(false);

  const activeDocId = controlledDocId ?? internalDocId;
  const activeDoc =
    docs.find((doc) => doc.id === activeDocId) ?? docs[0] ?? null;

  useEffect(() => {
    setSelectedOptions(poll.selectedOptionIds ?? []);
  }, [poll.selectedOptionIds]);

  useEffect(() => {
    setHasSubmitted(Boolean(poll.submitted));
  }, [poll.submitted]);

  const toggleOption = (optionId: string) => {
    if (poll.multiSelect) {
      setSelectedOptions((current) =>
        current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId]
      );
      return;
    }
    setSelectedOptions([optionId]);
  };

  const handleVote = () => {
    if (!selectedOptions.length) return;
    setHasSubmitted(true);
    onSubmitVote?.(selectedOptions);
  };

  const totalVotes = Math.max(
    poll.totalVotes,
    poll.options.reduce((sum, opt) => sum + opt.votes, 0)
  );

  return (
    <PhoneBottomSheetFrame
      open={open}
      onOpenChange={onOpenChange}
      title={t('live_sheet_title')}
      previewTiles={previewTiles}
      className={className}
    >
      {/* Segmented switcher: Poll | Docs (with Mira dot indicator) */}
      <div
        role="tablist"
        aria-label={t('live_sheet_title')}
        className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-muted p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'poll'}
          onClick={() => setTab('poll')}
          className={cn(
            'min-h-10 rounded-full px-3 font-semibold text-xs transition-colors motion-reduce:transition-none',
            activeTab === 'poll'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t('poll_tab')}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'docs'}
          onClick={() => setTab('docs')}
          className={cn(
            'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-3 font-semibold text-xs transition-colors motion-reduce:transition-none',
            activeTab === 'docs'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <span>{t('docs_tab')}</span>
          {docsHasMiraDot && (
            <span
              data-testid="docs-mira-dot"
              aria-hidden="true"
              className="size-2 rounded-full bg-dynamic-purple"
            />
          )}
        </button>
      </div>

      {activeTab === 'poll' ? (
        <div role="tabpanel" aria-label={t('poll_tab')} className="space-y-4">
          {/* Live pill + timer + Anonymous badge */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="success"
              className="gap-1.5 rounded-full px-2.5 py-0.5 font-semibold text-xs"
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-current motion-safe:animate-pulse motion-reduce:animate-none"
              />
              {t('poll_live')}
            </Badge>

            <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-secondary px-2.5 py-0.5 font-mono text-xs text-secondary-foreground tabular-nums">
              <Clock className="size-3" aria-hidden="true" />
              {poll.timerLabel}
            </span>

            {poll.anonymous && (
              <Badge
                variant="secondary"
                className="gap-1 rounded-full px-2.5 py-0.5 text-xs"
              >
                <EyeOff className="size-3" aria-hidden="true" />
                {t('anonymous_badge')}
              </Badge>
            )}
          </div>

          <h3 className="font-semibold text-base text-foreground leading-snug">
            {poll.question}
          </h3>

          {/* Single / multi option radio/checkbox cards (mono option text) */}
          <div
            role={poll.multiSelect ? 'group' : 'radiogroup'}
            aria-label={poll.question}
            className="space-y-2.5"
          >
            {poll.options.map((option) => {
              const selected = selectedOptions.includes(option.id);
              const pct =
                totalVotes > 0
                  ? Math.round((option.votes / totalVotes) * 100)
                  : 0;

              return (
                <button
                  key={option.id}
                  type="button"
                  role={poll.multiSelect ? 'checkbox' : 'radio'}
                  aria-checked={selected}
                  onClick={() => toggleOption(option.id)}
                  className={cn(
                    'w-full space-y-2 rounded-[18px] border p-3.5 text-left transition-colors motion-reduce:transition-none',
                    selected
                      ? 'border-dynamic-purple bg-dynamic-purple/10'
                      : 'border-border/80 bg-card hover:bg-accent/50'
                  )}
                >
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'grid size-5 shrink-0 place-items-center border',
                          poll.multiSelect ? 'rounded-md' : 'rounded-full',
                          selected
                            ? 'border-dynamic-purple bg-dynamic-purple text-white'
                            : 'border-input bg-background'
                        )}
                      >
                        {selected && <Check className="size-3" />}
                      </span>
                      <span className="truncate font-mono text-sm text-foreground">
                        {option.label}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                      {pct}%
                    </span>
                  </div>

                  {/* Live result progress bar */}
                  <Progress
                    value={pct}
                    aria-label={`${option.label}: ${pct}%`}
                    className="h-1.5"
                  />
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span className="font-mono tabular-nums">
              {t('poll_votes', { count: totalVotes })}
            </span>
            {hasSubmitted && (
              <span className="font-medium text-dynamic-green">
                {t('poll_submitted')}
              </span>
            )}
          </div>

          <Button
            type="button"
            disabled={selectedOptions.length === 0}
            onClick={handleVote}
            className="min-h-11 w-full rounded-full font-semibold"
          >
            {hasSubmitted ? t('poll_submitted') : t('poll_submit')}
          </Button>

          {/* Mira live summary card */}
          {poll.miraSummary && (
            <div
              data-testid="poll-mira-summary"
              style={{ backgroundColor: 'var(--mira-bg)' }}
              className="space-y-1.5 rounded-[18px] border border-dynamic-purple/30 p-3.5"
            >
              <div className="flex items-center gap-2 font-semibold text-xs text-dynamic-purple">
                <MiraMark size={18} />
                <span>{t('mira_summary_label')}</span>
              </div>
              <p className="text-foreground text-xs leading-relaxed">
                {poll.miraSummary}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div role="tabpanel" aria-label={t('docs_tab')} className="space-y-4">
          {/* Horizontal scrollable doc pills */}
          <div
            data-testid="docs-pill-strip"
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {docs.map((doc) => {
              const isActive = activeDoc?.id === doc.id;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => {
                    setInternalDocId(doc.id);
                    onSelectDoc?.(doc.id);
                  }}
                  aria-pressed={isActive}
                  className={cn(
                    'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-medium text-xs transition-colors motion-reduce:transition-none',
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/70 bg-secondary text-secondary-foreground hover:bg-accent'
                  )}
                >
                  <FileText className="size-3.5" aria-hidden="true" />
                  <span>{doc.title}</span>
                </button>
              );
            })}
          </div>

          {/* Collaborator avatar stack + Multi-doc · Paid badge */}
          <div className="flex items-center justify-between gap-2 rounded-[18px] border border-border/70 bg-card px-3.5 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex -space-x-2">
                {collaborators.slice(0, 4).map((person) => (
                  <Avatar
                    key={person.id}
                    className="size-7 border-2 border-card"
                    title={person.name}
                  >
                    <AvatarImage alt={person.name} src={person.avatarUrl} />
                    <AvatarFallback className="font-semibold text-[11px]">
                      {person.name.trim().slice(0, 1).toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <span className="text-muted-foreground text-xs">
                {t('collaborators_count', { count: collaborators.length })}
              </span>
            </div>

            <Badge
              variant="secondary"
              style={{ backgroundColor: 'var(--bg-purple)' }}
              className="gap-1 rounded-full px-2.5 py-1 font-semibold text-xs text-dynamic-purple"
            >
              <Sparkles className="size-3" aria-hidden="true" />
              {t('docs_multi_paid')}
            </Badge>
          </div>

          {/* Mira editing status + attribution + Accept / Undo / Diff */}
          {activeDoc && (
            <div
              data-testid="docs-mira-card"
              style={{ backgroundColor: 'var(--mira-bg)' }}
              className="space-y-3 rounded-[18px] border border-dynamic-purple/30 p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MiraMark size={20} />
                  <span className="font-semibold text-xs text-dynamic-purple">
                    {activeDoc.miraAttribution === 'chat'
                      ? t('docs_added_chat')
                      : t('docs_edited_voice')}
                  </span>
                </div>
              </div>

              {activeDoc.miraEditSummary && (
                <p className="text-foreground text-xs leading-relaxed">
                  {activeDoc.miraEditSummary}
                </p>
              )}

              {showDiff && (activeDoc.diffBefore || activeDoc.diffAfter) && (
                <div
                  data-testid="docs-diff-preview"
                  className="space-y-1 rounded-xl border border-border/70 bg-background/80 p-2.5 font-mono text-[11px]"
                >
                  {activeDoc.diffBefore && (
                    <p className="text-dynamic-red">- {activeDoc.diffBefore}</p>
                  )}
                  {activeDoc.diffAfter && (
                    <p className="text-dynamic-green">
                      + {activeDoc.diffAfter}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onAcceptMiraEdit?.(activeDoc.id)}
                  className="min-h-10 rounded-full px-3.5 text-xs"
                >
                  <Check className="size-3.5" aria-hidden="true" />
                  {t('docs_accept')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onUndoMiraEdit?.(activeDoc.id)}
                  className="min-h-10 rounded-full px-3.5 text-xs"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  {t('docs_undo')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-expanded={showDiff}
                  onClick={() => setShowDiff((prev) => !prev)}
                  className="min-h-10 rounded-full px-3 text-xs"
                >
                  <FileDiff className="size-3.5" aria-hidden="true" />
                  {showDiff ? t('diff_hide') : t('diff_show')}
                </Button>
              </div>
            </div>
          )}

          {/* Collaborator presence list */}
          {collaborators.length > 0 && (
            <section
              aria-label={t('collaborators_title')}
              className="space-y-2"
            >
              <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                {t('collaborators_title')}
              </h3>
              <ul className="space-y-1.5">
                {collaborators.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-card px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar className="size-7">
                        <AvatarImage alt={person.name} src={person.avatarUrl} />
                        <AvatarFallback className="font-semibold text-xs">
                          {person.name.trim().slice(0, 1).toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate font-medium text-xs text-foreground">
                        {person.name}
                      </span>
                    </div>
                    {person.status && (
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {person.status}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </PhoneBottomSheetFrame>
  );
}
