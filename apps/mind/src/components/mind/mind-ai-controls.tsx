'use client';

import { Brain, Zap } from '@tuturuuu/icons';
import type { AIModelUI } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import type { MindAiThinkingMode } from './mind-ai-options';
import { MindCreditSourceSelector } from './mind-credit-source-selector';
import { MindModelSelector } from './mind-model-selector';
import type { MindAiCreditSource } from './use-mind-ai-preferences';

type Props = {
  creditSource: MindAiCreditSource;
  directWrite: boolean;
  model: AIModelUI;
  thinkingMode: MindAiThinkingMode;
  compact?: boolean;
  personalWsId?: string;
  workspaceCreditLocked?: boolean;
  onDirectWriteChange: (value: boolean) => void;
  onCreditSourceChange: (value: MindAiCreditSource) => void;
  onModelChange: (value: AIModelUI) => void;
  onThinkingModeChange: (value: MindAiThinkingMode) => void;
  wsId: string;
};

export function MindAiControls({
  creditSource,
  compact,
  directWrite,
  model,
  thinkingMode,
  personalWsId,
  workspaceCreditLocked,
  onCreditSourceChange,
  onDirectWriteChange,
  onModelChange,
  onThinkingModeChange,
  wsId,
}: Props) {
  const t = useTranslations('mind');

  if (compact) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <div className="min-w-0 flex-[1_1_20rem] rounded-md border border-border bg-card/80">
          <MindModelSelector model={model} onModelChange={onModelChange} />
        </div>
        <ThinkingModeSelector
          onThinkingModeChange={onThinkingModeChange}
          thinkingMode={thinkingMode}
        />
        <MindCreditSourceSelector
          creditSource={creditSource}
          onCreditSourceChange={onCreditSourceChange}
          personalWsId={personalWsId}
          workspaceCreditLocked={workspaceCreditLocked}
          wsId={wsId}
        />
        <label className="flex h-8 min-w-56 items-center justify-between gap-2 rounded-md border border-border bg-card px-2 text-sm">
          <span className="min-w-0 truncate text-muted-foreground text-xs">
            {t('ai.writeMode')}
          </span>
          <div className="flex items-center gap-2">
            <Badge
              className="h-5 shrink-0 px-1.5 text-[10px]"
              variant={directWrite ? 'default' : 'secondary'}
            >
              {directWrite ? t('ai.implement') : t('ai.draft')}
            </Badge>
            <Switch
              checked={directWrite}
              onCheckedChange={onDirectWriteChange}
            />
          </div>
        </label>
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      <div className="grid gap-1 rounded-md border border-border bg-card p-1">
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1">
            <MindModelSelector model={model} onModelChange={onModelChange} />
          </div>
          <MindCreditSourceSelector
            creditSource={creditSource}
            onCreditSourceChange={onCreditSourceChange}
            personalWsId={personalWsId}
            workspaceCreditLocked={workspaceCreditLocked}
            wsId={wsId}
          />
          <ThinkingModeSelector
            onThinkingModeChange={onThinkingModeChange}
            thinkingMode={thinkingMode}
          />
        </div>
      </div>
      <label className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm">
        <span className="min-w-0 truncate text-muted-foreground text-xs">
          {t('ai.writeModeDescription')}
        </span>
        <div className="flex items-center gap-2">
          <Badge
            className="shrink-0"
            variant={directWrite ? 'default' : 'secondary'}
          >
            {directWrite ? t('ai.implement') : t('ai.draft')}
          </Badge>
          <Switch checked={directWrite} onCheckedChange={onDirectWriteChange} />
        </div>
      </label>
    </div>
  );
}

function ThinkingModeSelector({
  onThinkingModeChange,
  thinkingMode,
}: {
  onThinkingModeChange: (value: MindAiThinkingMode) => void;
  thinkingMode: MindAiThinkingMode;
}) {
  const t = useTranslations('mind');
  const Icon = thinkingMode === 'thinking' ? Brain : Zap;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-muted-foreground text-xs hover:bg-muted"
          type="button"
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{t(`ai.thinkingModes.${thinkingMode}`)}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {(['fast', 'thinking'] as const).map((mode) => {
          const ModeIcon = mode === 'thinking' ? Brain : Zap;
          return (
            <DropdownMenuItem
              key={mode}
              onSelect={() => onThinkingModeChange(mode)}
            >
              <ModeIcon className="h-4 w-4" />
              {t(`ai.thinkingModes.${mode}`)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
