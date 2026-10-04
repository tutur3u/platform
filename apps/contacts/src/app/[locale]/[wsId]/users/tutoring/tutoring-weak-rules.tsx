'use client';

import { Plus, Trash2 } from '@tuturuuu/icons';
import type {
  TutoringGroupExclusion,
  TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';

interface Props {
  canConfigure: boolean;
  policy: TutoringPolicy;
  onChange: (next: Partial<TutoringPolicy>) => void;
}

export function TutoringWeakRules({ canConfigure, policy, onChange }: Props) {
  const t = useTranslations('ws-tutoring');
  const matchOptions = (['contains', 'exact', 'prefix', 'suffix'] as const).map(
    (match) => ({ value: match, label: t(`policy_match_${match}`) })
  );
  const scopeOptions = (['all', 'make_up', 'weak_support'] as const).map(
    (scope) => ({ value: scope, label: t(`policy_scope_${scope}`) })
  );
  const updateExclusion = (
    index: number,
    next: Partial<TutoringGroupExclusion>
  ) =>
    onChange({
      groupExclusions: policy.groupExclusions.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...next } : rule
      ),
    });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{t('policy_weak_rules')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('policy_weak_rules_description')}
          </p>
        </div>
        {canConfigure ? (
          <Button
            disabled={policy.groupExclusions.length >= 30}
            onClick={() =>
              onChange({
                groupExclusions: [
                  ...policy.groupExclusions,
                  { scope: 'all', match: 'contains', value: '' },
                ],
              })
            }
            size="sm"
            variant="outline"
          >
            <Plus className="h-4 w-4" />
            {t('policy_add_weak_exclusion')}
          </Button>
        ) : null}
      </div>
      <div className="max-w-xs space-y-1">
        <Label htmlFor="policy-weakContentReviewDays">
          {t('policy_weakContentReviewDays')}
        </Label>
        <Input
          disabled={!canConfigure}
          id="policy-weakContentReviewDays"
          max={90}
          min={0}
          onChange={(event) =>
            onChange({ weakContentReviewDays: Number(event.target.value) })
          }
          type="number"
          value={policy.weakContentReviewDays}
        />
        <p className="text-muted-foreground text-xs">
          {t('policy_weak_review_help')}
        </p>
      </div>
      {policy.groupExclusions.length === 0 ? (
        <p className="rounded-lg bg-muted/50 p-3 text-muted-foreground text-sm">
          {t('policy_no_weak_exclusions')}
        </p>
      ) : null}
      {policy.groupExclusions.map((rule, index) => (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2"
          key={`weak-exclusion-${index}`}
        >
          <Combobox
            className="w-full sm:w-44"
            disabled={!canConfigure}
            onChange={(value) =>
              updateExclusion(index, {
                scope: value as TutoringGroupExclusion['scope'],
              })
            }
            options={scopeOptions}
            placeholder={t('policy_scope')}
            selected={rule.scope}
          />
          <Combobox
            className="w-full sm:w-40"
            disabled={!canConfigure}
            onChange={(value) =>
              updateExclusion(index, {
                match: value as TutoringGroupExclusion['match'],
              })
            }
            options={matchOptions}
            placeholder={t('policy_match')}
            selected={rule.match}
          />
          <Input
            aria-label={t('policy_group_name_pattern')}
            className="min-w-40 flex-1"
            disabled={!canConfigure}
            maxLength={80}
            onChange={(event) =>
              updateExclusion(index, { value: event.target.value })
            }
            placeholder={t('policy_group_name_pattern')}
            value={rule.value}
          />
          {canConfigure ? (
            <Button
              aria-label={t('policy_remove_weak_exclusion')}
              onClick={() =>
                onChange({
                  groupExclusions: policy.groupExclusions.filter(
                    (_, ruleIndex) => ruleIndex !== index
                  ),
                })
              }
              size="icon"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ))}
    </section>
  );
}
