'use client';

import { Plus, Trash2 } from '@tuturuuu/icons';
import type {
  TutoringPolicy,
  TutoringTimeRule,
} from '@tuturuuu/internal-api/tutoring-policy';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';

function WeekdayToggles({
  days,
  disabled,
  label,
  onChange,
}: {
  days: number[];
  disabled: boolean;
  label: string;
  onChange: (days: number[]) => void;
}) {
  const t = useTranslations('ws-tutoring');
  return (
    <fieldset className="space-y-1">
      <legend className="text-muted-foreground text-xs">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 7 }, (_, day) => (
          <Button
            aria-pressed={days.includes(day)}
            disabled={disabled}
            key={day}
            onClick={() =>
              onChange(
                days.includes(day)
                  ? days.filter((value) => value !== day)
                  : [...days, day].sort()
              )
            }
            size="sm"
            type="button"
            variant={days.includes(day) ? 'default' : 'outline'}
          >
            {t(`policy_weekday_${day}`)}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

/** Shift rules: class window and days to the tutoring window and days. */
export function TutoringShiftRulesEditor({
  canConfigure,
  onChange,
  policy,
}: {
  canConfigure: boolean;
  onChange: (next: Partial<TutoringPolicy>) => void;
  policy: TutoringPolicy;
}) {
  const t = useTranslations('ws-tutoring');
  const editRule = (index: number, next: Partial<TutoringTimeRule>) =>
    onChange({
      timeRules: policy.timeRules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...next } : rule
      ),
    });
  const timeField = (
    index: number,
    field: 'classStartTime' | 'classEndTime' | 'tutoringStartTime',
    label: string,
    value: string | undefined
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`policy-${field}-${index}`}>{label}</Label>
      <Input
        disabled={!canConfigure}
        id={`policy-${field}-${index}`}
        onChange={(event) =>
          editRule(index, {
            [field]:
              field === 'classEndTime' && !event.target.value
                ? undefined
                : event.target.value,
          })
        }
        type="time"
        value={value ?? ''}
      />
    </div>
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{t('policy_exceptions')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('policy_exceptions_description')}
          </p>
        </div>
        {canConfigure ? (
          <Button
            disabled={policy.timeRules.length >= 30}
            onClick={() =>
              onChange({
                timeRules: [
                  ...policy.timeRules,
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
      {policy.timeRules.length === 0 ? (
        <p className="rounded-lg bg-muted/50 p-3 text-muted-foreground text-sm">
          {t('policy_no_exceptions')}
        </p>
      ) : null}
      {policy.timeRules.map((rule, index) => (
        <div
          className="space-y-3 rounded-lg border bg-muted/20 p-3"
          key={`policy-rule-${index}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap gap-4">
              <WeekdayToggles
                days={rule.classWeekdays ?? []}
                disabled={!canConfigure}
                label={t('policy_class_days')}
                onChange={(days) =>
                  editRule(index, {
                    classWeekdays: days.length ? days : undefined,
                  })
                }
              />
              <WeekdayToggles
                days={rule.weekdays}
                disabled={!canConfigure}
                label={t('policy_tutoring_days')}
                onChange={(weekdays) => editRule(index, { weekdays })}
              />
            </div>
            {canConfigure ? (
              <Button
                aria-label={t('policy_remove_exception')}
                onClick={() =>
                  onChange({
                    timeRules: policy.timeRules.filter(
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor={`policy-label-${index}`}>
                {t('policy_shift_label')}
              </Label>
              <Input
                disabled={!canConfigure}
                id={`policy-label-${index}`}
                maxLength={50}
                onChange={(event) =>
                  editRule(index, { label: event.target.value })
                }
                value={rule.label ?? ''}
              />
            </div>
            {timeField(
              index,
              'classStartTime',
              t('policy_class_time'),
              rule.classStartTime
            )}
            {timeField(
              index,
              'classEndTime',
              t('policy_class_end_time'),
              rule.classEndTime
            )}
            {timeField(
              index,
              'tutoringStartTime',
              t('policy_tutoring_time'),
              rule.tutoringStartTime
            )}
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
    </>
  );
}
