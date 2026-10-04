'use client';

import { Pencil, Save, X } from '@tuturuuu/icons';
import type { TutoringPolicy } from '@tuturuuu/internal-api/tutoring-policy';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { formatSessionTimeRange } from './tutoring-filters';

export type PolicySectionId =
  | 'presets'
  | 'timing'
  | 'exceptions'
  | 'weak'
  | 'campuses'
  | 'message';
const TITLES = {
  presets: 'policy_presets',
  timing: 'policy_timing',
  exceptions: 'policy_exceptions',
  weak: 'policy_weak_rules',
  campuses: 'policy_campuses',
  message: 'policy_parent_template',
} as const;
const NUMERIC = [
  'durationMinutes',
  'leadMinutes',
  'weakSupportSessions',
  'absenceLookbackDays',
  'reassessmentDays',
  'followUpDays',
  'schedulingHorizonDays',
] as const;

function PolicySummary({
  id,
  policy,
  groups,
}: {
  id: PolicySectionId;
  policy: TutoringPolicy;
  groups: UserGroup[];
}) {
  const t = useTranslations('ws-tutoring');
  if (id === 'presets') return <p>{t(`policy_${policy.preset}`)}</p>;
  if (id === 'timing')
    return (
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {NUMERIC.map((field) => (
          <div key={field}>
            <dt className="text-muted-foreground text-sm">
              {t(`policy_${field}`)}
            </dt>
            <dd className="font-medium">{policy[field]}</dd>
          </div>
        ))}
      </dl>
    );
  if (id === 'exceptions')
    return policy.timeRules.length ? (
      <ul className="divide-y">
        {policy.timeRules.map((rule, index) => (
          <li className="flex flex-wrap justify-between gap-2 py-3" key={index}>
            <div>
              <p className="font-medium">
                {rule.label || t('policy_class_time')}: {rule.classStartTime}
              </p>
              <p className="text-muted-foreground text-sm">
                {rule.weekdays
                  .map((day) => t(`policy_weekday_${day}`))
                  .join(', ')}
              </p>
            </div>
            <p className="tabular-nums">
              {formatSessionTimeRange(
                rule.tutoringStartTime,
                rule.durationMinutes
              )}
            </p>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-muted-foreground text-sm">
        {t('policy_no_exceptions')}
      </p>
    );
  if (id === 'weak')
    return (
      <div className="space-y-2">
        <p>
          {t('policy_weakContentReviewDays')}: {policy.weakContentReviewDays}
        </p>
        {policy.groupExclusions.length ? (
          <ul className="space-y-1 text-sm">
            {policy.groupExclusions.map((rule, index) => (
              <li key={index}>
                {t(`policy_scope_${rule.scope}`)} ·{' '}
                {t(`policy_match_${rule.match}`)} · {rule.value}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t('policy_no_weak_exclusions')}
          </p>
        )}
      </div>
    );
  if (id === 'campuses')
    return Object.entries(policy.campusByGroupId).length ? (
      <dl className="space-y-2">
        {Object.entries(policy.campusByGroupId).map(([groupId, name]) => (
          <div className="flex justify-between gap-3" key={groupId}>
            <dt>
              {groups.find((group) => group.id === groupId)?.name || groupId}
            </dt>
            <dd>{name}</dd>
          </div>
        ))}
      </dl>
    ) : (
      <p className="text-muted-foreground text-sm">
        {t('policy_campuses_description')}
      </p>
    );
  return (
    <p className="whitespace-pre-wrap text-sm">
      {policy.parentMessageTemplate}
    </p>
  );
}

export function TutoringPolicySection({
  id,
  editing,
  canConfigure,
  changed,
  pending,
  valid,
  onEdit,
  onCancel,
  onSave,
  policy,
  groups,
  children,
}: {
  id: PolicySectionId;
  editing: PolicySectionId | null;
  canConfigure: boolean;
  changed: boolean;
  pending: boolean;
  valid: boolean;
  onEdit: (id: PolicySectionId) => void;
  onCancel: () => void;
  onSave: () => void;
  policy: TutoringPolicy;
  groups: UserGroup[];
  children: ReactNode;
}) {
  const t = useTranslations('ws-tutoring');
  const active = editing === id;
  return (
    <section
      aria-label={t(TITLES[id])}
      className="space-y-3 rounded-xl border bg-card p-4"
    >
      {!active ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-medium">{t(TITLES[id])}</h3>
            {canConfigure ? (
              <Button
                disabled={editing !== null}
                onClick={() => onEdit(id)}
                size="sm"
                variant="outline"
              >
                <Pencil className="h-4 w-4" />
                {t('policy_edit')}
              </Button>
            ) : null}
          </div>
          <PolicySummary groups={groups} id={id} policy={policy} />
        </>
      ) : (
        <>
          <fieldset className="space-y-3" disabled={pending}>
            {children}
          </fieldset>
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button
              disabled={pending}
              onClick={onCancel}
              size="sm"
              variant="ghost"
            >
              <X className="h-4 w-4" />
              {t('policy_cancel')}
            </Button>
            <Button
              disabled={!changed || !valid || pending}
              onClick={onSave}
              size="sm"
            >
              <Save className="h-4 w-4" />
              {t('policy_save')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
