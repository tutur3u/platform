'use client';

import { Loader2, ShieldCheck, ShieldX } from '@tuturuuu/icons';
import type {
  AbuseReputationSubjectType,
  AbuseRiskTier,
  AbuseTrustOverride,
  CreateAbuseTrustOverridePayload,
} from '@tuturuuu/internal-api/infrastructure/abuse';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
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
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { formatDateTime, getTierTone } from './abuse-intelligence-format';

const SUBJECT_TYPES: AbuseReputationSubjectType[] = [
  'user',
  'session',
  'api_key',
  'ip',
  'cidr',
  'user_location',
];

const TIERS: AbuseRiskTier[] = [
  'trusted',
  'standard',
  'watch',
  'challenge_required',
  'restricted',
];

export function AbuseOverrideControls({
  isCreating,
  isRevoking,
  onCreate,
  onRevoke,
  overrides,
}: {
  isCreating: boolean;
  isRevoking: boolean;
  onCreate: (payload: CreateAbuseTrustOverridePayload) => void;
  onRevoke: (overrideId: string) => void;
  overrides: AbuseTrustOverride[];
}) {
  const t = useTranslations('abuse-intelligence');
  const [subjectType, setSubjectType] =
    useState<AbuseReputationSubjectType>('user');
  const [tier, setTier] = useState<AbuseRiskTier>('trusted');

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <form
        className="space-y-4 rounded-lg border border-border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          onCreate({
            reason: String(formData.get('reason') ?? '').trim(),
            subjectKey: String(formData.get('subjectKey') ?? '').trim(),
            subjectType,
            tier,
          });
          event.currentTarget.reset();
        }}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-lg">{t('overrides.title')}</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('overrides.subject_type')}</Label>
            <Select
              value={subjectType}
              onValueChange={(value) =>
                setSubjectType(value as AbuseReputationSubjectType)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBJECT_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`subject_types.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('overrides.tier')}</Label>
            <Select
              value={tier}
              onValueChange={(value) => setTier(value as AbuseRiskTier)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIERS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`tiers.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="abuse-subject-key">
            {t('overrides.subject_key')}
          </Label>
          <Input id="abuse-subject-key" name="subjectKey" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="abuse-override-reason">{t('overrides.reason')}</Label>
          <Textarea id="abuse-override-reason" name="reason" required />
        </div>
        <Button disabled={isCreating} type="submit">
          {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('overrides.create')}
        </Button>
      </form>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold text-lg">{t('overrides.active')}</h2>
        {overrides.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t('empty.overrides')}
          </p>
        ) : (
          overrides.map((override) => (
            <div
              className="space-y-2 rounded-md border border-border p-3"
              key={override.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge className={getTierTone(override.tier)}>
                    {t(`tiers.${override.tier}`)}
                  </Badge>
                  <div className="mt-2 truncate font-mono text-xs">
                    {override.subject_key}
                  </div>
                </div>
                <Button
                  disabled={isRevoking}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => onRevoke(override.id)}
                >
                  <ShieldX className="h-4 w-4" />
                  {t('overrides.revoke')}
                </Button>
              </div>
              <p className="text-muted-foreground text-sm">{override.reason}</p>
              <p className="text-muted-foreground text-xs">
                {t('overrides.expires', {
                  value: formatDateTime(override.expires_at),
                })}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
