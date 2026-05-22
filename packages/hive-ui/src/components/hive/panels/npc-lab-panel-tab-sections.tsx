'use client';

import { MessageSquareText, Play, RotateCcw, Save } from '@tuturuuu/icons';
import type { AIModelUI } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { TabsContent } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import type { NpcLabTabsProps } from './npc-lab-panel-types';

const agentModes = [
  { id: 'algorithmic', labelKey: 'mode_algorithmic' },
  { id: 'llm', labelKey: 'mode_llm' },
  { id: 'hybrid', labelKey: 'mode_hybrid' },
] as const;

const toggleFields = [
  { key: 'memoryEnabled', labelKey: 'memory' },
  { key: 'backstoryEnabled', labelKey: 'backstory_toggle' },
  { key: 'customPromptEnabled', labelKey: 'custom_prompt' },
] as const;

function asNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function modelLabel(model: AIModelUI) {
  return `${model.provider}/${model.label}`;
}

export function IdentityTab({
  draft,
  setDraft,
}: Pick<NpcLabTabsProps, 'draft' | 'setDraft'>) {
  const t = useTranslations('studio.npcLab');

  return (
    <TabsContent className="space-y-3 pt-3" value="identity">
      <label className="block text-muted-foreground text-xs">
        {t('name')}
        <Input
          className="mt-1"
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          value={draft.name}
        />
      </label>
      <label className="block text-muted-foreground text-xs">
        {t('role')}
        <Input
          className="mt-1"
          onChange={(event) => setDraft({ ...draft, role: event.target.value })}
          value={draft.role}
        />
      </label>
      <label className="block text-muted-foreground text-xs">
        {t('backstory')}
        <Textarea
          className="mt-1 min-h-28"
          onChange={(event) =>
            setDraft({ ...draft, backstory: event.target.value })
          }
          value={draft.backstory}
        />
      </label>
    </TabsContent>
  );
}

export function BrainTab({
  aiContext,
  draft,
  setDraft,
}: Pick<NpcLabTabsProps, 'aiContext' | 'draft' | 'setDraft'>) {
  const t = useTranslations('studio.npcLab');
  const draftModelOption = !aiContext.models.some(
    (model) => model.value === draft.model
  )
    ? {
        label: draft.model,
        provider: draft.model.includes('/')
          ? (draft.model.split('/')[0] ?? 'custom')
          : 'custom',
        value: draft.model,
      }
    : null;
  const modelOptions = draftModelOption
    ? [draftModelOption, ...aiContext.models]
    : aiContext.models;

  return (
    <TabsContent className="space-y-3 pt-3" value="brain">
      <label className="block text-muted-foreground text-xs">
        {t('model')}
        <Select
          onValueChange={(value) => setDraft({ ...draft, model: value })}
          value={draft.model}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modelOptions.map((model) => (
              <SelectItem key={model.value} value={model.value}>
                {modelLabel(model)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <div className="grid grid-cols-3 gap-2">
        {toggleFields.map(({ key, labelKey }) => (
          <label
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-2 text-muted-foreground text-xs"
            key={key}
          >
            {t(labelKey)}
            <Switch
              checked={Boolean(draft[key])}
              onCheckedChange={(checked) =>
                setDraft({ ...draft, [key]: checked })
              }
            />
          </label>
        ))}
      </div>
      <label className="block text-muted-foreground text-xs">
        {t('system_prompt')}
        <Textarea
          className="mt-1 min-h-32"
          onChange={(event) =>
            setDraft({ ...draft, systemPrompt: event.target.value })
          }
          value={draft.systemPrompt}
        />
      </label>
    </TabsContent>
  );
}

export function BehaviorTab({
  draft,
  onPatchSettings,
}: Pick<NpcLabTabsProps, 'draft' | 'onPatchSettings'>) {
  const t = useTranslations('studio.npcLab');

  return (
    <TabsContent className="space-y-3 pt-3" value="behavior">
      <div className="grid grid-cols-3 gap-2">
        {agentModes.map((mode) => (
          <button
            className={[
              'rounded-md border px-2 py-2 text-xs transition',
              draft.settings.agentMode === mode.id
                ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
            ].join(' ')}
            key={mode.id}
            onClick={() => onPatchSettings({ agentMode: mode.id })}
            type="button"
          >
            {t(mode.labelKey)}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3 text-sm">
        <span>
          <span className="block font-medium">{t('autonomous')}</span>
          <span className="text-muted-foreground text-xs">
            {t('autonomous_hint')}
          </span>
        </span>
        <Switch
          checked={draft.settings.autonomous === true}
          onCheckedChange={(checked) =>
            onPatchSettings({ autonomous: checked })
          }
        />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <NumberField
          label={t('max_turns')}
          min={1}
          onChange={(value) => onPatchSettings({ maxTurns: value })}
          value={asNumber(draft.settings.maxTurns, 4)}
        />
        <NumberField
          label={t('cooldown_seconds')}
          min={0}
          onChange={(value) => onPatchSettings({ cooldownSeconds: value })}
          value={asNumber(draft.settings.cooldownSeconds, 900)}
        />
        <NumberField
          label={t('range')}
          min={1}
          onChange={(value) => onPatchSettings({ interactionRange: value })}
          value={asNumber(draft.settings.interactionRange, 6)}
        />
      </div>
    </TabsContent>
  );
}

export function InteractionsTab({
  aiContext,
  interactionPrompt,
  interactionTurns,
  isRunning,
  npc,
  onRun,
  onRunInteraction,
  setInteractionPrompt,
  setInteractionTurns,
  setTargetNpcId,
  targetNpcId,
  targetNpcs,
  world,
}: Pick<
  NpcLabTabsProps,
  | 'aiContext'
  | 'interactionPrompt'
  | 'interactionTurns'
  | 'isRunning'
  | 'npc'
  | 'onRun'
  | 'onRunInteraction'
  | 'setInteractionPrompt'
  | 'setInteractionTurns'
  | 'setTargetNpcId'
  | 'targetNpcId'
  | 'targetNpcs'
  | 'world'
>) {
  const t = useTranslations('studio.npcLab');

  return (
    <TabsContent className="space-y-3 pt-3" value="interactions">
      <div className="rounded-md border border-border bg-muted/30 p-3 text-muted-foreground text-xs">
        {t('active_model', { model: aiContext.model.label })}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['default', 'enhanced', 'custom'] as const).map((mode) => (
          <Button
            disabled={isRunning}
            key={mode}
            onClick={() => onRun(npc.id, mode)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Play className="h-3.5 w-3.5" />
            {t(`run_${mode}`)}
          </Button>
        ))}
      </div>
      <label className="block text-muted-foreground text-xs">
        {t('target_npc')}
        <Select onValueChange={setTargetNpcId} value={targetNpcId ?? undefined}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={t('target_placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {targetNpcs.map((target) => (
              <SelectItem key={target.id} value={target.id}>
                {target.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="block text-muted-foreground text-xs">
        {t('interaction_prompt')}
        <Textarea
          className="mt-1 min-h-24"
          onChange={(event) => setInteractionPrompt(event.target.value)}
          value={interactionPrompt}
        />
      </label>
      <NumberField
        label={t('conversation_turns')}
        max={12}
        min={1}
        onChange={setInteractionTurns}
        value={interactionTurns}
      />
      <Button
        disabled={isRunning || !targetNpcId}
        onClick={() =>
          targetNpcId &&
          onRunInteraction({
            maxTurns: interactionTurns,
            prompt: interactionPrompt || null,
            sourceNpcId: npc.id,
            targetNpcId,
          })
        }
        type="button"
      >
        <MessageSquareText className="h-4 w-4" />
        {t('start_interaction')}
      </Button>
      <p className="text-muted-foreground text-xs">
        {t('context', {
          blocks: world.blocks.length,
          objects: world.objects.length,
        })}
      </p>
    </TabsContent>
  );
}

function NumberField({
  label,
  max,
  min,
  onChange,
  value,
}: {
  label: string;
  max?: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="block text-muted-foreground text-xs">
      {label}
      <Input
        className="mt-1"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
    </label>
  );
}

export function SaveBar({
  hasChanges,
  onResetDraft,
  onSaveDraft,
}: Pick<NpcLabTabsProps, 'hasChanges' | 'onResetDraft' | 'onSaveDraft'>) {
  const t = useTranslations('studio.npcLab');

  return (
    <div className="mt-4 flex items-center justify-end gap-2 border-border border-t pt-3">
      <Button
        disabled={!hasChanges}
        onClick={onResetDraft}
        size="sm"
        type="button"
        variant="outline"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {t('reset')}
      </Button>
      <Button
        disabled={!hasChanges}
        onClick={onSaveDraft}
        size="sm"
        type="button"
      >
        <Save className="h-3.5 w-3.5" />
        {t('save')}
      </Button>
    </div>
  );
}
