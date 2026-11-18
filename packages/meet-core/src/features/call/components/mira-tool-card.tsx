'use client';

import {
  Check,
  Loader2,
  ShieldCheck,
  Square,
  Undo2,
  Wrench,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useRef, useState } from 'react';
import { MiraAvatar } from './mira-profile';
import { type MiraSurface, miraSurfaceIcons } from './mira-where-strip';

export type MiraToolStatus =
  | 'proposed'
  | 'running'
  | 'applied'
  | 'stopped'
  | 'undone';
export type MiraToolAction = 'approve' | 'stop' | 'undo';

export type MiraToolCall = {
  id: string;
  title: string;
  status: MiraToolStatus;
  summary?: string;
  attribution?: 'live' | 'chat';
  scope:
    | { kind: 'suggest' }
    | { kind: 'surface'; surface: MiraSurface; label?: string };
};

const actions = {
  proposed: { name: 'approve', Icon: Check },
  running: { name: 'stop', Icon: Square },
  applied: { name: 'undo', Icon: Undo2 },
  stopped: null,
  undone: null,
} as const;

export function MiraToolCard({
  tool,
  children,
  onFocusSurface,
  onAction,
}: {
  tool: MiraToolCall;
  children?: ReactNode;
  onFocusSurface?: (surface: MiraSurface) => void;
  onAction?: (action: MiraToolAction) => Promise<void>;
}) {
  const t = useTranslations('meet.call.miraEverywhere');
  const inFlight = useRef(false);
  const [phase, setPhase] = useState<'idle' | 'pending' | 'error'>('idle');
  const action = onAction && actions[tool.status];
  const target = tool.scope.kind === 'surface' ? tool.scope : undefined;
  const ToolIcon = target ? miraSurfaceIcons[target.surface] : Wrench;
  const targetLabel =
    target && (target.label || t(`surfaces.${target.surface}`));

  async function act(name: MiraToolAction) {
    if (!onAction || inFlight.current) return;
    inFlight.current = true;
    setPhase('pending');
    try {
      await onAction(name);
      setPhase('idle');
    } catch {
      setPhase('error');
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <section
      aria-label={tool.title}
      className="mt-2 min-w-0 overflow-hidden rounded-xl border border-dynamic-purple/25 bg-card shadow-sm"
    >
      <header className="flex flex-wrap items-center gap-2 border-b bg-dynamic-purple/5 p-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-calendar-bg-purple text-dynamic-purple">
          <ToolIcon aria-hidden className="size-4" />
        </span>
        <h4 className="wrap-break-word min-w-0 flex-1 font-semibold text-xs">
          {tool.title}
        </h4>
        <Badge
          role="status"
          variant="outline"
          className={cn(
            tool.status === 'running' &&
              'bg-calendar-bg-purple text-dynamic-purple',
            tool.status === 'applied' &&
              'bg-calendar-bg-green text-dynamic-green',
            tool.status === 'proposed' &&
              'bg-calendar-bg-orange text-dynamic-orange'
          )}
        >
          {t(`tools.status.${tool.status}`)}
        </Badge>
      </header>
      {(tool.summary || children) && (
        <div className="wrap-break-word space-y-2 p-2.5 text-xs">
          {tool.summary && (
            <p className="text-muted-foreground">{tool.summary}</p>
          )}
          {children}
        </div>
      )}
      {tool.status === 'applied' && tool.attribution && (
        <div className="px-2.5 pb-2">
          <Badge
            variant="outline"
            className="gap-1 rounded-full border-dynamic-purple/35 bg-card text-dynamic-purple"
          >
            <MiraAvatar size={16} />
            {t(
              tool.attribution === 'live'
                ? 'tools.attributedLive'
                : 'tools.attributedChat'
            )}
          </Badge>
        </div>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t p-2">
        {target && onFocusSurface ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-auto min-h-7 max-w-full whitespace-normal motion-reduce:transition-none"
            onClick={() => onFocusSurface(target.surface)}
          >
            <ToolIcon aria-hidden className="size-3.5" />
            {targetLabel}
          </Button>
        ) : (
          <Badge variant="outline" className="max-w-full whitespace-normal">
            <ShieldCheck aria-hidden className="size-3 shrink-0" />
            {targetLabel ?? t('tools.suggest')}
          </Badge>
        )}
        {action && (
          <Button
            type="button"
            variant={action.name === 'approve' ? 'default' : 'outline'}
            size="sm"
            className="ms-auto h-7 motion-reduce:transition-none"
            disabled={phase === 'pending'}
            onClick={() => void act(action.name)}
          >
            {phase === 'pending' ? (
              <Loader2
                aria-hidden
                className="size-3.5 motion-safe:animate-spin motion-reduce:animate-none"
              />
            ) : (
              <action.Icon aria-hidden className="size-3.5" />
            )}
            {t(`tools.actions.${action.name}`)}
          </Button>
        )}
        {phase === 'error' && (
          <p role="alert" className="w-full text-destructive text-xs">
            {t('tools.failed')}
          </p>
        )}
      </footer>
    </section>
  );
}
