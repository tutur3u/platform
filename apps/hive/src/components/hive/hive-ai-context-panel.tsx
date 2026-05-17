'use client';

import { matchesAllowedModel } from '@tuturuuu/ai/credits/model-mapping';
import { Bot, Coins, Sparkles, Users } from '@tuturuuu/icons';
import type {
  HiveCreditSource,
  HiveServerSettings,
} from '@tuturuuu/internal-api/hive';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
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
import { useTranslations } from 'next-intl';
import type { HiveServer } from '@/engine/types';
import type { HiveAiContextState } from './use-hive-ai-context';

type HiveAiContextPanelProps = {
  aiContext: HiveAiContextState;
  isAdmin: boolean;
  onUpdateServerSettings: (settings: HiveServerSettings) => void;
  selectedServer: HiveServer | null;
};

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
    <label className="flex min-w-0 flex-col gap-1 text-[11px] text-muted-foreground">
      {label}
      <Input
        className="h-8 w-full rounded-md text-xs"
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
    </label>
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
  const groupedModels = aiContext.models.reduce<
    Record<string, HiveAiContextState['models']>
  >((groups, model) => {
    const provider = model.provider || 'unknown';
    groups[provider] = [...(groups[provider] ?? []), model];
    return groups;
  }, {});

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
    <section className="pointer-events-auto flex max-w-[min(68rem,calc(100vw-2rem))] flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-background/88 p-2 text-foreground shadow-2xl shadow-foreground/10 backdrop-blur-xl">
      <div className="flex min-w-[13rem] items-center gap-2">
        <Users className="h-4 w-4 text-dynamic-blue" />
        <Select
          onValueChange={(value) => aiContext.setWorkspaceId(value)}
          value={aiContext.workspaceId ?? undefined}
        >
          <SelectTrigger aria-label={t('workspace')} className="h-9">
            <SelectValue placeholder={t('workspace')} />
          </SelectTrigger>
          <SelectContent>
            {aiContext.workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex rounded-md border border-border bg-muted/30 p-1">
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
            onClick={() => setCreditSource(source)}
            type="button"
          >
            {t(`credit_${source}`)}
          </button>
        ))}
      </div>
      <div className="flex min-w-[14rem] items-center gap-2">
        <Bot className="h-4 w-4 text-dynamic-purple" />
        <Select
          onValueChange={(value) => aiContext.setModelId(value)}
          value={aiContext.model.value}
        >
          <SelectTrigger aria-label={t('model')} className="h-9">
            <SelectValue placeholder={t('model')} />
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
      </div>
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
        <Coins className="h-3.5 w-3.5 text-dynamic-yellow" />
        <span className="font-medium">
          {formatCredits(aiContext.credits?.remaining)}
        </span>
        <span className="text-muted-foreground">
          {t('remaining', { tier: aiContext.credits?.tier ?? 'FREE' })}
        </span>
      </div>
      {isAdmin && selectedServer ? (
        <div className="flex min-w-full flex-wrap items-end gap-2 border-border border-t pt-2">
          <label className="flex items-center gap-2 text-muted-foreground text-xs">
            <Switch
              checked={settings.autonomousNpcEnabled === true}
              onCheckedChange={(checked) =>
                updateAutonomySettings({ autonomousNpcEnabled: checked })
              }
            />
            <Sparkles className="h-3.5 w-3.5 text-dynamic-green" />
            {t('autonomy')}
          </label>
          <Button
            disabled={!aiContext.aiRunContext}
            onClick={() =>
              aiContext.aiRunContext &&
              updateAutonomySettings({
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
          <NumberSetting
            label={t('max_interactions')}
            min={0}
            onChange={(value) =>
              updateAutonomySettings({
                maxAutonomousInteractionsPerTick: value,
              })
            }
            value={settings.maxAutonomousInteractionsPerTick ?? 1}
          />
          <NumberSetting
            label={t('max_turns')}
            min={1}
            onChange={(value) =>
              updateAutonomySettings({
                maxInteractionTurns: value,
              })
            }
            value={settings.maxInteractionTurns ?? 4}
          />
          <NumberSetting
            label={t('cooldown_seconds')}
            min={0}
            onChange={(value) =>
              updateAutonomySettings({
                minInteractionCooldownSeconds: value,
              })
            }
            value={settings.minInteractionCooldownSeconds ?? 900}
          />
        </div>
      ) : null}
    </section>
  );
}
