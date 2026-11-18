'use client';
import {
  Bookmark,
  Ellipsis,
  Loader2,
  Play,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { classNames as cn } from './class-names';
import type { WorkbenchAction } from './workbench-layout';

/** One slim row: identity on the left, the two or three primary actions on the right, the rest in a menu. */
export function WorkbenchToolbar({
  title,
  language,
  status,
  participants,
  controls,
  actions,
  meeting,
}: {
  title: string;
  language: PlaygroundLanguage;
  status: 'connecting' | 'open' | 'offline';
  participants: string[];
  controls:
    | {
        kind: 'playground';
        editable: boolean;
        busy: boolean;
        onRun: () => void;
        onStop: () => void;
        onSave: () => void;
        pending: boolean;
      }
    | {
        kind: 'problem';
        editable: boolean;
        onTest: () => void;
        pending: boolean;
      }
    | { kind: 'none' };
  actions: WorkbenchAction[];
  meeting?: {
    mark?: ReactNode;
    onRuntime?: (value: PlaygroundLanguage) => void;
    runtimePending?: boolean;
  };
}) {
  const t = useTranslations('programmingPlayground');
  const runtime = {
    python: 'Python',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    c: 'C',
    cpp: 'C++',
    java: 'Java',
    rust: 'Rust',
    go: 'Go',
    ruby: 'Ruby',
    php: 'PHP',
    shell: 'Shell',
  } satisfies Record<PlaygroundLanguage, string>;
  return (
    <header
      className={cn(
        'flex min-h-10 shrink-0 items-center gap-2 border-b px-2',
        meeting && 'flex-wrap py-1.5'
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {meeting?.mark}
        <strong className="truncate font-medium text-sm">{title}</strong>
        {!meeting?.onRuntime && (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {runtime[language]}
          </span>
        )}
        {status !== 'open' && (
          <output className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
            <Loader2
              className="size-3 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            {t(status)}
          </output>
        )}
        <span
          className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs"
          title={participants.join(', ')}
        >
          <Users className="size-3.5" aria-hidden="true" />
          {participants.length}
          <span className="sr-only">{participants.join(', ')}</span>
        </span>
      </div>
      {meeting?.onRuntime && (
        <Select
          value={language}
          disabled={meeting.runtimePending}
          onValueChange={(value) => {
            const chosen = PLAYGROUND_LANGUAGES.find(
              (language) => language === value
            );
            if (chosen) meeting.onRuntime?.(chosen);
          }}
        >
          <SelectTrigger
            aria-label={t('language')}
            className="h-8 w-auto max-w-32 rounded-full motion-reduce:transition-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLAYGROUND_LANGUAGES.filter((value) => value !== 'shell').map(
              (value) => (
                <SelectItem key={value} value={value}>
                  {runtime[value]}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      )}
      {controls.kind === 'problem' && (
        <Button
          size="sm"
          disabled={!controls.editable || controls.pending}
          onClick={controls.onTest}
        >
          <Play className="size-3.5" />
          {t('test')}
        </Button>
      )}
      {controls.kind === 'playground' && (
        <>
          <Button
            size="sm"
            disabled={controls.pending || !controls.editable || controls.busy}
            onClick={controls.onRun}
          >
            <Play className="size-3.5" />
            {t('run')}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={t('stop')}
            title={t('stop')}
            disabled={controls.pending || !controls.editable}
            onClick={controls.onStop}
          >
            <Square className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={t(meeting ? 'checkpoint' : 'save')}
            title={t(meeting ? 'checkpoint' : 'save')}
            disabled={controls.pending || !controls.editable || controls.busy}
            onClick={controls.onSave}
          >
            {meeting ? (
              <Bookmark className="size-3.5" />
            ) : (
              <Save className="size-3.5" />
            )}
          </Button>
        </>
      )}
      {actions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
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
    </header>
  );
}
