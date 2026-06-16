'use client';

import { Loader2, Plus } from '@tuturuuu/icons';
import type {
  CreateRateLimitRulePayload,
  RateLimitMode,
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
  describeEffectiveWriteLimits,
  describeReadEffect,
} from './rate-limits-format';

const SUBJECT_KEY_PREFIX: Record<AbuseReputationSubjectType, string> = {
  api_key: 'api-key:<uuid>',
  cidr: 'cidr:203.0.113.0/24',
  ip: 'ip:203.0.113.10',
  session: 'session:<hash>',
  user: 'user:<uuid>',
  user_location: 'user-location:<uuid>:<ip>',
  workspace: 'workspace:<uuid>',
};

function toInt(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

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
  const [subjectType, setSubjectType] =
    useState<AbuseReputationSubjectType>('user');
  const [subjectKey, setSubjectKey] = useState('');
  const [tier, setTier] = useState<AbuseRiskTier>('standard');
  const [limitMode, setLimitMode] =
    useState<RateLimitMode>('inherit_multiplier');
  const [multiplier, setMultiplier] = useState('3');
  const [writeMinute, setWriteMinute] = useState('');
  const [writeHour, setWriteHour] = useState('');
  const [writeDay, setWriteDay] = useState('');
  const [readMinute, setReadMinute] = useState('');
  const [reason, setReason] = useState('');

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
      limit_mode: limitMode,
      trust_multiplier: Number.parseFloat(multiplier) || 1,
    }),
    [limitMode, multiplier, writeMinute, writeHour, writeDay, readMinute]
  );

  function reset() {
    setSubjectKey('');
    setReason('');
    setMultiplier('3');
    setWriteMinute('');
    setWriteHour('');
    setWriteDay('');
    setReadMinute('');
  }

  function submit() {
    const payload: CreateRateLimitRulePayload = {
      limitMode,
      reason: reason.trim(),
      subjectKey: subjectKey.trim(),
      subjectType,
      tier,
    };
    if (limitMode === 'inherit_multiplier') {
      payload.trustMultiplier = Number.parseFloat(multiplier) || 1;
    }
    if (limitMode === 'absolute') {
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
    (limitMode !== 'absolute' ||
      !!(toInt(writeMinute) || toInt(writeHour) || toInt(writeDay)));

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="h-4 w-4" />
          {t('rules.create')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('rules.create')}</DialogTitle>
          <DialogDescription>{t('rules.create_description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('fields.subject_type')}</Label>
              <Select
                onValueChange={(value) =>
                  setSubjectType(value as AbuseReputationSubjectType)
                }
                value={subjectType}
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="rl-subject-key">{t('fields.subject_key')}</Label>
            <Input
              id="rl-subject-key"
              onChange={(event) => setSubjectKey(event.target.value)}
              placeholder={SUBJECT_KEY_PREFIX[subjectType]}
              value={subjectKey}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('fields.mode')}</Label>
            <Select
              onValueChange={(value) => setLimitMode(value as RateLimitMode)}
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

          {limitMode === 'inherit_multiplier' ? (
            <div className="space-y-2">
              <Label htmlFor="rl-multiplier">{t('fields.multiplier')}</Label>
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
            <div className="space-y-3 rounded-md border border-border p-3">
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
              <p className="font-medium text-sm">{t('fields.absolute_read')}</p>
              <Input
                onChange={(event) => setReadMinute(event.target.value)}
                placeholder={t('fields.read_per_minute')}
                type="number"
                value={readMinute}
              />
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="rl-reason">{t('fields.reason')}</Label>
            <Textarea
              id="rl-reason"
              onChange={(event) => setReason(event.target.value)}
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
