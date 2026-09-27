'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw, Save, Trash2 } from '@tuturuuu/icons';
import { updateTutoringPolicy } from '@tuturuuu/internal-api/tutoring';
import {
  EASY_CENTER_TUTORING_POLICY,
  parseTutoringPolicy,
  STANDARD_TUTORING_POLICY,
  type TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  canConfigure: boolean;
  policy: TutoringPolicy;
  wsId: string;
}

const NUMERIC_FIELDS = [
  ['durationMinutes', 1, 480],
  ['leadMinutes', 0, 480],
  ['weakSupportSessions', 1, 6],
  ['reassessmentDays', 1, 90],
  ['followUpDays', 1, 90],
  ['schedulingHorizonDays', 1, 180],
] as const;

export function TutoringPolicyCard({ canConfigure, policy, wsId }: Props) {
  const t = useTranslations('ws-tutoring');
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<TutoringPolicy>(policy);
  const changed = JSON.stringify(draft) !== JSON.stringify(policy);
  const valid = Boolean(parseTutoringPolicy(draft));
  const save = useMutation({
    mutationFn: () => updateTutoringPolicy(wsId, draft),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['tutoring-policy', wsId],
      });
      toast.success(t('policy_saved'));
    },
    onError: () => toast.error(t('policy_save_failed')),
  });

  const edit = (next: Partial<TutoringPolicy>) =>
    setDraft((current) => ({ ...current, ...next, preset: 'custom' }));
  const editRule = (
    index: number,
    next: Partial<TutoringPolicy['timeRules'][number]>
  ) =>
    edit({
      timeRules: draft.timeRules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...next } : rule
      ),
    });

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg tracking-tight">
            {t('policy_title')}
          </h2>
          <p className="max-w-2xl text-muted-foreground text-sm">
            {t('policy_description')}
          </p>
        </div>
        {canConfigure ? (
          <div className="flex gap-2">
            <Button
              disabled={!changed || save.isPending}
              onClick={() => setDraft(policy)}
              size="sm"
              variant="ghost"
            >
              <RotateCcw className="h-4 w-4" />
              {t('policy_discard')}
            </Button>
            <Button
              disabled={!changed || !valid || save.isPending}
              onClick={() => save.mutate()}
              size="sm"
            >
              <Save className="h-4 w-4" />
              {t('policy_save')}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div>
          <h3 className="font-medium">{t('policy_presets')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('policy_presets_description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!canConfigure}
            onClick={() => setDraft({ ...STANDARD_TUTORING_POLICY })}
            size="sm"
            variant={draft.preset === 'standard' ? 'default' : 'outline'}
          >
            {t('policy_standard')}
          </Button>
          <Button
            disabled={!canConfigure}
            onClick={() =>
              setDraft({
                ...EASY_CENTER_TUTORING_POLICY,
                timeRules: EASY_CENTER_TUTORING_POLICY.timeRules.map(
                  (rule) => ({ ...rule, weekdays: [...rule.weekdays] })
                ),
              })
            }
            size="sm"
            variant={draft.preset === 'easy_center' ? 'default' : 'outline'}
          >
            {t('policy_easy_center')}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          {t('policy_review_note')}
        </p>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div>
          <h3 className="font-medium">{t('policy_timing')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('policy_timing_description')}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NUMERIC_FIELDS.map(([field, min, max]) => (
            <div className="space-y-1" key={field}>
              <Label htmlFor={`policy-${field}`}>{t(`policy_${field}`)}</Label>
              <Input
                disabled={!canConfigure}
                id={`policy-${field}`}
                max={max}
                min={min}
                onChange={(event) =>
                  edit({ [field]: Number(event.target.value) })
                }
                type="number"
                value={draft[field]}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-medium">{t('policy_exceptions')}</h3>
            <p className="text-muted-foreground text-sm">
              {t('policy_exceptions_description')}
            </p>
          </div>
          {canConfigure ? (
            <Button
              disabled={draft.timeRules.length >= 30}
              onClick={() =>
                edit({
                  timeRules: [
                    ...draft.timeRules,
                    {
                      weekdays: [0, 6],
                      classStartTime: '08:00',
                      tutoringStartTime: '09:30',
                      durationMinutes: 60,
                    },
                  ],
                })
              }
              size="sm"
              variant="outline"
            >
              <Plus className="h-4 w-4" />
              {t('policy_add_exception')}
            </Button>
          ) : null}
        </div>
        {draft.timeRules.length === 0 ? (
          <p className="rounded-lg bg-muted/50 p-3 text-muted-foreground text-sm">
            {t('policy_no_exceptions')}
          </p>
        ) : null}
        {draft.timeRules.map((rule, index) => (
          <div
            className="space-y-3 rounded-lg border bg-muted/20 p-3"
            key={`policy-rule-${index}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 7 }, (_, day) => (
                  <Button
                    aria-pressed={rule.weekdays.includes(day)}
                    disabled={!canConfigure}
                    key={day}
                    onClick={() =>
                      editRule(index, {
                        weekdays: rule.weekdays.includes(day)
                          ? rule.weekdays.filter((value) => value !== day)
                          : [...rule.weekdays, day].sort(),
                      })
                    }
                    size="sm"
                    type="button"
                    variant={
                      rule.weekdays.includes(day) ? 'default' : 'outline'
                    }
                  >
                    {t(`policy_weekday_${day}`)}
                  </Button>
                ))}
              </div>
              {canConfigure ? (
                <Button
                  aria-label={t('policy_remove_exception')}
                  onClick={() =>
                    edit({
                      timeRules: draft.timeRules.filter(
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
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor={`policy-class-${index}`}>
                  {t('policy_class_time')}
                </Label>
                <Input
                  disabled={!canConfigure}
                  id={`policy-class-${index}`}
                  onChange={(event) =>
                    editRule(index, { classStartTime: event.target.value })
                  }
                  type="time"
                  value={rule.classStartTime}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`policy-tutor-${index}`}>
                  {t('policy_tutoring_time')}
                </Label>
                <Input
                  disabled={!canConfigure}
                  id={`policy-tutor-${index}`}
                  onChange={(event) =>
                    editRule(index, { tutoringStartTime: event.target.value })
                  }
                  type="time"
                  value={rule.tutoringStartTime}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`policy-duration-${index}`}>
                  {t('policy_rule_duration')}
                </Label>
                <Input
                  disabled={!canConfigure}
                  id={`policy-duration-${index}`}
                  max={480}
                  min={1}
                  onChange={(event) =>
                    editRule(index, {
                      durationMinutes: Number(event.target.value),
                    })
                  }
                  type="number"
                  value={rule.durationMinutes}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border bg-card p-4">
        <Label htmlFor="policy-parent-template">
          {t('policy_parent_template')}
        </Label>
        <p className="text-muted-foreground text-sm">
          {t('policy_parent_template_help')}
        </p>
        <Textarea
          disabled={!canConfigure}
          id="policy-parent-template"
          onChange={(event) =>
            edit({ parentMessageTemplate: event.target.value })
          }
          rows={4}
          value={draft.parentMessageTemplate}
        />
      </div>
      {!valid ? (
        <p className="text-destructive text-sm" role="alert">
          {t('policy_invalid')}
        </p>
      ) : null}
    </section>
  );
}
