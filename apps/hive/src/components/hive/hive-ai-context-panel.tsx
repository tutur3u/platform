'use client';

import { matchesAllowedModel } from '@tuturuuu/ai/credits/model-mapping';
import { Bot, ChevronDown, Coins, Sparkles, Users } from '@tuturuuu/icons';
import type {
  HiveCreditSource,
  HiveServerSettings,
} from '@tuturuuu/internal-api/hive';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type { HiveServer } from '@/engine/types';
import type { HiveAiContextState } from './use-hive-ai-context';

type HiveAiContextPanelProps = {
  aiContext: HiveAiContextState;
  isAdmin: boolean;
  onUpdateServerSettings: (settings: HiveServerSettings) => void;
  selectedServer: HiveServer | null;
};

type GroupedModels = Record<string, HiveAiContextState['models']>;

function formatCredits(value: number | null | undefined) {
  if (value == null) return '0';
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value > 100 ? 0 : 2,
  }).format(value);
}

function NumberSetting({
  label,
  min,
  onChange,
  value,
}: {
  label: string;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 font-medium text-[11px] text-muted-foreground">
      {label}
      <Input
        className="h-8 w-full rounded-md bg-background/80 text-xs"
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
    </label>
  );
}

function AiContextTrigger({
  creditLabel,
  creditsLabel,
  modelLabel,
}: {
  creditLabel: string;
  creditsLabel: string;
  modelLabel: string;
}) {
  const t = useTranslations('studio.ai');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>
          <button
            aria-label={t('toggle_context')}
            className="inline-flex h-9 min-w-9 max-w-[13rem] items-center gap-2 rounded-md border border-border bg-background px-1.5 text-left transition-[background-color,border-color,box-shadow,color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-foreground/25 hover:text-foreground"
            type="button"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-dynamic-purple/50 bg-dynamic-purple/10 text-dynamic-purple shadow-dynamic-purple/20 shadow-inner">
              <Bot className="h-3.5 w-3.5" />
            </span>
            <span className="hidden min-w-0 flex-col leading-none sm:flex">
              <span className="max-w-[9rem] truncate font-medium text-xs">
                {modelLabel}
              </span>
              <span className="mt-0.5 max-w-[9rem] truncate text-[10px] text-muted-foreground">
                {creditLabel} · {creditsLabel}
              </span>
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />
          </button>
        </PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom">{t('toggle_context')}</TooltipContent>
    </Tooltip>
  );
}

function AiContextSelectorGrid({
  aiContext,
  allowedModels,
  groupedModels,
}: {
  aiContext: HiveAiContextState;
  allowedModels: string[];
  groupedModels: GroupedModels;
}) {
  const t = useTranslations('studio.ai');

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="min-w-0 space-y-1 font-medium text-[11px] text-muted-foreground">
        {t('workspace')}
        <Select
          onValueChange={(value) => aiContext.setWorkspaceId(value)}
          value={aiContext.workspaceId ?? undefined}
        >
          <SelectTrigger
            aria-label={t('workspace')}
            className="h-8 w-full rounded-md"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Users className="h-3.5 w-3.5 shrink-0 text-dynamic-blue" />
              <SelectValue placeholder={t('workspace')} />
            </div>
          </SelectTrigger>
          <SelectContent>
            {aiContext.workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="min-w-0 space-y-1 font-medium text-[11px] text-muted-foreground">
        {t('model')}
        <Select
          onValueChange={(value) => aiContext.setModelId(value)}
          value={aiContext.model.value}
        >
          <SelectTrigger
            aria-label={t('model')}
            className="h-8 w-full rounded-md"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Bot className="h-3.5 w-3.5 shrink-0 text-dynamic-purple" />
              <SelectValue placeholder={t('model')} />
            </div>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(groupedModels).map(([provider, models]) => (
              <SelectGroup key={provider}>
                <SelectLabel>{provider}</SelectLabel>
                {models.map((model) => {
                  const allowed = matchesAllowedModel(
                    model.value,
                    allowedModels
                  );
                  return (
                    <SelectItem
                      disabled={!allowed || model.disabled}
                      key={model.value}
                      value={model.value}
                    >
                      {model.label}
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </label>
    </div>
  );
}

function CreditSourceSelector({
  aiContext,
  onSetCreditSource,
}: {
  aiContext: HiveAiContextState;
  onSetCreditSource: (source: HiveCreditSource) => void;
}) {
  const t = useTranslations('studio.ai');

  return (
    <div className="space-y-1">
      <p className="font-medium text-[11px] text-muted-foreground">
        {t('credit_source')}
      </p>
      <div className="grid grid-cols-2 rounded-md border border-border bg-muted/30 p-1">
        {(['personal', 'workspace'] as const).map((source) => (
          <button
            aria-pressed={aiContext.activeCreditSource === source}
            className={[
              'rounded-sm px-3 py-1.5 font-medium text-xs transition',
              aiContext.activeCreditSource === source
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              aiContext.workspaceCreditLocked && source === 'workspace'
                ? 'cursor-not-allowed opacity-45'
                : '',
            ].join(' ')}
            disabled={aiContext.workspaceCreditLocked && source === 'workspace'}
            key={source}
            onClick={() => onSetCreditSource(source)}
            type="button"
          >
            {t(`credit_${source}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

function AutonomySettingsPanel({
  aiContext,
  onUpdateAutonomySettings,
  settings,
}: {
  aiContext: HiveAiContextState;
  onUpdateAutonomySettings: (patch: HiveServerSettings) => void;
  settings: HiveServerSettings;
}) {
  const t = useTranslations('studio.ai');

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-muted-foreground text-xs">
          <Switch
            checked={settings.autonomousNpcEnabled === true}
            onCheckedChange={(checked) =>
              onUpdateAutonomySettings({ autonomousNpcEnabled: checked })
            }
          />
          <Sparkles className="h-3.5 w-3.5 text-dynamic-green" />
          {t('autonomy')}
        </label>
        <Button
          className="h-8"
          disabled={!aiContext.aiRunContext}
          onClick={() =>
            aiContext.aiRunContext &&
            onUpdateAutonomySettings({
              defaultCreditSource: aiContext.aiRunContext.creditSource,
              defaultCreditWsId: aiContext.aiRunContext.creditWsId,
              defaultModel: aiContext.aiRunContext.model,
            })
          }
          size="sm"
          type="button"
          variant="outline"
        >
          {t('use_for_autonomy')}
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <NumberSetting
          label={t('max_interactions')}
          min={0}
          onChange={(value) =>
            onUpdateAutonomySettings({
              maxAutonomousInteractionsPerTick: value,
            })
          }
          value={settings.maxAutonomousInteractionsPerTick ?? 1}
        />
        <NumberSetting
          label={t('max_turns')}
          min={1}
          onChange={(value) =>
            onUpdateAutonomySettings({
              maxInteractionTurns: value,
            })
          }
          value={settings.maxInteractionTurns ?? 4}
        />
        <NumberSetting
          label={t('cooldown_seconds')}
          min={0}
          onChange={(value) =>
            onUpdateAutonomySettings({
              minInteractionCooldownSeconds: value,
            })
          }
          value={settings.minInteractionCooldownSeconds ?? 900}
        />
      </div>
    </div>
  );
}

export function HiveAiContextPanel({
  aiContext,
  isAdmin,
  onUpdateServerSettings,
  selectedServer,
}: HiveAiContextPanelProps) {
  const t = useTranslations('studio.ai');
  const settings = selectedServer?.settings ?? {};
  const allowedModels = aiContext.credits?.allowedModels ?? [];
  const creditLabel = t(`credit_${aiContext.activeCreditSource}`);
  const creditsLabel = formatCredits(aiContext.credits?.remaining);
  const modelLabel = aiContext.model.label || t('model');
  const workspaceLabel = aiContext.selectedWorkspace?.name ?? t('workspace');
  const groupedModels = aiContext.models.reduce<GroupedModels>(
    (groups, model) => {
      const provider = model.provider || 'unknown';
      groups[provider] = [...(groups[provider] ?? []), model];
      return groups;
    },
    {}
  );

  const setCreditSource = (source: HiveCreditSource) => {
    if (aiContext.workspaceCreditLocked && source === 'workspace') return;
    aiContext.setCreditSource(source);
  };

  const updateAutonomySettings = (patch: HiveServerSettings) => {
    onUpdateServerSettings({
      ...patch,
    });
  };

  return (
    <Popover>
      <AiContextTrigger
        creditLabel={creditLabel}
        creditsLabel={creditsLabel}
        modelLabel={modelLabel}
      />
      <PopoverContent
        align="end"
        className="data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1 w-[min(26rem,calc(100vw-2rem))] rounded-xl border-border/80 bg-background/95 p-3 shadow-2xl backdrop-blur-xl"
        sideOffset={8}
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-sm">{t('context')}</p>
              <p className="mt-1 truncate text-muted-foreground text-xs">
                {workspaceLabel} · {modelLabel}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs">
              <Coins className="h-3.5 w-3.5 text-dynamic-yellow" />
              <span className="font-medium">{creditsLabel}</span>
              <span className="text-muted-foreground">
                {aiContext.credits?.tier ?? 'FREE'}
              </span>
            </div>
          </div>

          <AiContextSelectorGrid
            aiContext={aiContext}
            allowedModels={allowedModels}
            groupedModels={groupedModels}
          />

          <CreditSourceSelector
            aiContext={aiContext}
            onSetCreditSource={setCreditSource}
          />

          {isAdmin && selectedServer ? (
            <AutonomySettingsPanel
              aiContext={aiContext}
              onUpdateAutonomySettings={updateAutonomySettings}
              settings={settings}
            />
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
