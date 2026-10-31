'use client';
import { Ellipsis, Loader2, Play, Save, Square, Users } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import type { WorkbenchAction } from './workbench-layout';

/** One slim row: identity on the left, the two or three primary actions on the right, the rest in a menu. */
export function WorkbenchToolbar({
  title,
  language,
  status,
  participants,
  controls,
  actions,
}: {
  title: string;
  language: string;
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
}) {
  const t = useTranslations('programmingPlayground');
  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <strong className="truncate font-medium text-sm">{title}</strong>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          {language}
        </span>
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
            aria-label={t('save')}
            title={t('save')}
            disabled={controls.pending || !controls.editable || controls.busy}
            onClick={controls.onSave}
          >
            <Save className="size-3.5" />
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
