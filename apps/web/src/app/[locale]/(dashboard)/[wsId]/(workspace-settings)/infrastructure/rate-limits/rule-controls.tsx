'use client';

import { Loader2, Plus } from '@tuturuuu/icons';
import type {
  CreateRateLimitRulePayload,
  RateLimitMode,
  RateLimitSubjectSearchResult,
  RateLimitWriteBaseLimits,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import {
  ABUSE_REPUTATION_SUBJECT_TYPES,
  ABUSE_RISK_TIERS,
  type AbuseReputationSubjectType,
  type AbuseRiskTier,
  RATE_LIMIT_MODES,
} from '@tuturuuu/utils/abuse-protection';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  getPresetExpiresAt,
  getRateLimitRulePreset,
  RATE_LIMIT_RULE_PRESETS,
  type RateLimitRulePresetKey,
} from './rate-limit-rule-presets';
import {
  type GuidedSubjectKind,
  RateLimitSubjectPicker,
} from './rate-limit-subject-picker';
import {
  describeEffectiveWriteLimits,
  describeReadEffect,
} from './rate-limits-format';

function toInt(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function subjectTypeForKind(
  kind: GuidedSubjectKind
): AbuseReputationSubjectType {
  if (kind === 'advanced') return 'workspace';
  if (kind === 'cidr') return 'cidr';
  if (kind === 'session') return 'session';
  return kind;
}

function subjectKeyForTypedInput(kind: GuidedSubjectKind, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (kind === 'cidr') {
    return trimmed.startsWith('cidr:') ? trimmed : `cidr:${trimmed}`;
  }
  if (kind === 'session') {
    return trimmed.startsWith('session:') ? trimmed : `session:${trimmed}`;
  }
  return trimmed;
}

const PRESET_TRANSLATION_KEYS = {
  custom: {
    description: 'presets.custom.description',
    label: 'presets.custom.label',
  },
  event_or_classroom: {
    description: 'presets.event_or_classroom.description',
    label: 'presets.event_or_classroom.label',
  },
  extended_trusted: {
    description: 'presets.extended_trusted.description',
    label: 'presets.extended_trusted.label',
  },
  trusted_workspace: {
    description: 'presets.trusted_workspace.description',
    label: 'presets.trusted_workspace.label',
  },
} as const satisfies Record<
  RateLimitRulePresetKey,
  { description: string; label: string }
>;

export function RateLimitRuleDialog({
  base,
  isSubmitting,
  onCreate,
}: {
  base: RateLimitWriteBaseLimits;
  isSubmitting: boolean;
  onCreate: (payload: CreateRateLimitRulePayload) => void;
}) {
  const t = useTranslations('rate-limits');
  const [open, setOpen] = useState(false);
  const [subjectKind, setSubjectKind] =
    useState<GuidedSubjectKind>('workspace');
  const [advancedSubjectType, setAdvancedSubjectType] =
    useState<AbuseReputationSubjectType>('workspace');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [selectedSubject, setSelectedSubject] =
    useState<RateLimitSubjectSearchResult | null>(null);
  const [typedSubjectKey, setTypedSubjectKey] = useState('');
  const [presetKey, setPresetKey] =
    useState<RateLimitRulePresetKey>('trusted_workspace');
  const [tier, setTier] = useState<AbuseRiskTier>('trusted');
  const [limitMode, setLimitMode] =
    useState<RateLimitMode>('inherit_multiplier');
  const [multiplier, setMultiplier] = useState('3');
  const [writeMinute, setWriteMinute] = useState('');
  const [writeHour, setWriteHour] = useState('');
  const [writeDay, setWriteDay] = useState('');
  const [readMinute, setReadMinute] = useState('');
  const [reason, setReason] = useState('');

  const selectedPreset = getRateLimitRulePreset(presetKey);
  const isCustom = presetKey === 'custom';
  const subjectKey =
    selectedSubject?.subjectKey ??
    subjectKeyForTypedInput(subjectKind, typedSubjectKey);
  const subjectType =
    selectedSubject?.subjectType ?? subjectTypeForKind(subjectKind);
  const effectiveSubjectType =
    subjectKind === 'advanced' ? advancedSubjectType : subjectType;
  const effectiveMode = isCustom
    ? limitMode
    : (selectedPreset?.limitMode ?? 'inherit_multiplier');
  const effectiveTier = isCustom ? tier : (selectedPreset?.tier ?? 'trusted');
  const effectiveMultiplier = isCustom
    ? Number.parseFloat(multiplier) || 1
    : (selectedPreset?.defaultMultiplier ?? 1);

  const previewRule = useMemo(
    () => ({
      absolute_limits: {
        read: { minute: toInt(readMinute) },
        write: {
          day: toInt(writeDay),
          hour: toInt(writeHour),
          minute: toInt(writeMinute),
        },
      },
      limit_mode: effectiveMode,
      trust_multiplier: effectiveMultiplier,
    }),
    [
      effectiveMode,
      effectiveMultiplier,
      writeMinute,
      writeHour,
      writeDay,
      readMinute,
    ]
  );

  function reset() {
    setSubjectKind('workspace');
    setAdvancedSubjectType('workspace');
    setSubjectSearch('');
    setSelectedSubject(null);
    setTypedSubjectKey('');
    setPresetKey('trusted_workspace');
    setTier('trusted');
    setLimitMode('inherit_multiplier');
    setMultiplier('3');
    setWriteMinute('');
    setWriteHour('');
    setWriteDay('');
    setReadMinute('');
    setReason('');
  }

  function submit() {
    const payload: CreateRateLimitRulePayload = {
      expiresAt: getPresetExpiresAt(selectedPreset?.defaultDays ?? null),
      limitMode: effectiveMode,
      presetKey,
      reason: reason.trim(),
      subjectKey,
      subjectType: effectiveSubjectType,
      tier: effectiveTier,
    };

    if (effectiveMode === 'inherit_multiplier') {
      payload.trustMultiplier = effectiveMultiplier;
    }
    if (effectiveMode === 'absolute') {
      payload.absoluteLimits = {
        read: toInt(readMinute) ? { minute: toInt(readMinute) } : undefined,
        write: {
          day: toInt(writeDay),
          hour: toInt(writeHour),
          minute: toInt(writeMinute),
        },
      };
    }

    onCreate(payload);
    setOpen(false);
    reset();
  }

  const canSubmit =
    subjectKey.trim().length > 0 &&
    reason.trim().length > 0 &&
    (effectiveMode !== 'absolute' ||
      !!(toInt(writeMinute) || toInt(writeHour) || toInt(writeDay)));

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="h-4 w-4" />
          {t('rules.create')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('rules.create')}</DialogTitle>
          <DialogDescription>{t('rules.create_description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <RateLimitSubjectPicker
            advancedSubjectKey={typedSubjectKey}
            kind={subjectKind}
            onAdvancedSubjectKeyChange={setTypedSubjectKey}
            onKindChange={setSubjectKind}
            onQueryChange={setSubjectSearch}
            onSelect={(value) => setSelectedSubject(value)}
            query={subjectSearch}
            selected={selectedSubject}
          />

          {subjectKind === 'advanced' ? (
            <div className="space-y-2">
              <Label>{t('fields.subject_type')}</Label>
              <Select
                onValueChange={(value) =>
                  setAdvancedSubjectType(value as AbuseReputationSubjectType)
                }
                value={advancedSubjectType}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ABUSE_REPUTATION_SUBJECT_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`subject_types.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>{t('guided.preset')}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {RATE_LIMIT_RULE_PRESETS.map((preset) => (
                <button
                  className={`rounded-md border p-3 text-left transition hover:bg-muted/60 ${
                    presetKey === preset.key
                      ? 'border-primary bg-muted'
                      : 'border-border'
                  }`}
                  key={preset.key}
                  onClick={() => setPresetKey(preset.key)}
                  type="button"
                >
                  <span className="block font-medium text-sm">
                    {t(PRESET_TRANSLATION_KEYS[preset.key].label)}
                  </span>
                  <span className="mt-1 block text-muted-foreground text-xs">
                    {t(PRESET_TRANSLATION_KEYS[preset.key].description)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {isCustom ? (
            <div className="space-y-4 rounded-md border border-border p-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('fields.tier')}</Label>
                  <Select
                    onValueChange={(value) => setTier(value as AbuseRiskTier)}
                    value={tier}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ABUSE_RISK_TIERS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`tiers.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('fields.mode')}</Label>
                  <Select
                    onValueChange={(value) =>
                      setLimitMode(value as RateLimitMode)
                    }
                    value={limitMode}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RATE_LIMIT_MODES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`modes.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {limitMode === 'inherit_multiplier' ? (
                <div className="space-y-2">
                  <Label htmlFor="rl-multiplier">
                    {t('fields.multiplier')}
                  </Label>
                  <Input
                    id="rl-multiplier"
                    max={1000}
                    min={0.1}
                    onChange={(event) => setMultiplier(event.target.value)}
                    step={0.05}
                    type="number"
                    value={multiplier}
                  />
                </div>
              ) : null}

              {limitMode === 'absolute' ? (
                <div className="space-y-3">
                  <p className="font-medium text-sm">
                    {t('fields.absolute_write')}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      onChange={(event) => setWriteMinute(event.target.value)}
                      placeholder={t('fields.per_minute')}
                      type="number"
                      value={writeMinute}
                    />
                    <Input
                      onChange={(event) => setWriteHour(event.target.value)}
                      placeholder={t('fields.per_hour')}
                      type="number"
                      value={writeHour}
                    />
                    <Input
                      onChange={(event) => setWriteDay(event.target.value)}
                      placeholder={t('fields.per_day')}
                      type="number"
                      value={writeDay}
                    />
                  </div>
                  <Input
                    onChange={(event) => setReadMinute(event.target.value)}
                    placeholder={t('fields.read_per_minute')}
                    type="number"
                    value={readMinute}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-md border border-border border-dashed bg-muted/40 p-3 text-sm">
            <p className="font-medium">{t('fields.preview')}</p>
            <p className="text-muted-foreground">
              {describeEffectiveWriteLimits(previewRule, base)}
            </p>
            <p className="text-muted-foreground">
              {describeReadEffect(previewRule)}
            </p>
            {subjectKey ? (
              <p className="mt-2 break-all text-muted-foreground text-xs">
                {t('guided.technical_subject')}: {subjectKey}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="rl-reason">{t('fields.reason')}</Label>
            <Textarea
              id="rl-reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('fields.reason_placeholder')}
              value={reason}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={!canSubmit || isSubmitting}
            onClick={submit}
            type="button"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('rules.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
