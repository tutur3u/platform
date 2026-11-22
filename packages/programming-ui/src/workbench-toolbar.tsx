'use client';
import {
  Bookmark,
  CodeXml,
  Ellipsis,
  Loader2,
  Save,
  Square,
  Users,
} from '@tuturuuu/icons';
import {
  PLAYGROUND_LANGUAGES,
  type PlaygroundLanguage,
} from '@tuturuuu/types/primitives/playgrounds';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { WorkbenchAction } from './workbench-layout';
import {
  LANGUAGE_LABELS,
  WorkbenchLanguagePicker,
} from './workbench-language-picker';
import { WorkbenchRunButton } from './workbench-run-button';

export type WorkbenchControls =
  | {
      kind: 'playground';
      editable: boolean;
      busy: boolean;
      onRun: () => void;
      onStop: () => void;
      onSave?: () => void;
      pending: boolean;
    }
  | {
      kind: 'problem';
      editable: boolean;
      onTest: () => void;
      pending: boolean;
    }
  | { kind: 'none' };

/** Identity and runtime on the left, Run and the two secondary actions on the right, the rest in a menu. */
export function WorkbenchToolbar({
  title,
  language,
  status,
  participants,
  controls,
  actions,
  meeting,
  problem = false,
}: {
  title: string;
  language: PlaygroundLanguage;
  status: 'connecting' | 'open' | 'offline';
  participants: string[];
  controls: WorkbenchControls;
  actions: WorkbenchAction[];
  problem?: boolean;
  meeting?: {
    mark?: ReactNode;
    onRuntime?: (value: PlaygroundLanguage) => void;
    runtimePending?: boolean;
  };
}) {
  const t = useTranslations('programmingPlayground');
  const languages = PLAYGROUND_LANGUAGES.filter(
    (value) => !problem || value !== 'shell'
  );
  const iconButton = 'size-8 rounded-full';
  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {meeting ? (
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
          >
            <CodeXml className="size-4" />
          </span>
        ) : null}
        {meeting?.mark}
        <div className="flex min-w-0 flex-col leading-tight">
          <strong className="truncate font-semibold text-sm">{title}</strong>
          <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
            {meeting && <span className="truncate">{t('coding')}</span>}
            {status !== 'open' ? (
              <output className="flex shrink-0 items-center gap-1">
                <Loader2
                  className="size-3 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                {t(status)}
              </output>
            ) : (
              <span
                className="flex shrink-0 items-center gap-1"
                title={participants.join(', ')}
              >
                <Users className="size-3" aria-hidden="true" />
                {t('editingCount', { count: participants.length })}
                <span className="sr-only">{participants.join(', ')}</span>
              </span>
            )}
          </span>
        </div>
        {meeting ? (
          <WorkbenchLanguagePicker
            language={language}
            languages={languages}
            onChange={meeting.onRuntime}
            pending={meeting.runtimePending}
          />
        ) : (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            {LANGUAGE_LABELS[language]}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {controls.kind === 'problem' && (
          <WorkbenchRunButton
            label={t('test')}
            busy={controls.pending}
            disabled={!controls.editable || controls.pending}
            onRun={controls.onTest}
          />
        )}
        {controls.kind === 'playground' && (
          <>
            <WorkbenchRunButton
              label={t('run')}
              busy={controls.busy || controls.pending}
              disabled={controls.pending || !controls.editable || controls.busy}
              onRun={controls.onRun}
            />
            <Button
              size="icon"
              variant="outline"
              className={iconButton}
              aria-label={t('stop')}
              title={t('stop')}
              disabled={controls.pending || !controls.editable}
              onClick={controls.onStop}
            >
              <Square className="size-3.5" />
            </Button>
            {controls.onSave && (
              <Button
                size="icon"
                variant="ghost"
                className={iconButton}
                aria-label={t(meeting ? 'checkpoint' : 'save')}
                title={t(meeting ? 'checkpoint' : 'save')}
                disabled={
                  controls.pending || !controls.editable || controls.busy
                }
                onClick={controls.onSave}
              >
                {meeting ? (
                  <Bookmark className="size-3.5" />
                ) : (
                  <Save className="size-3.5" />
                )}
              </Button>
            )}
          </>
        )}
        {actions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className={iconButton}
                aria-label={t('more')}
              >
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {actions.map((action) => (
                <DropdownMenuItem
                  key={action.id}
                  disabled={action.disabled}
                  variant={action.destructive ? 'destructive' : 'default'}
                  onSelect={action.onSelect}
                >
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
