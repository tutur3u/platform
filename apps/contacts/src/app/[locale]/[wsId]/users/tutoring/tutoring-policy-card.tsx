'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from '@tuturuuu/icons';
import { updateTutoringPolicy } from '@tuturuuu/internal-api/tutoring';
import {
  EASY_CENTER_TUTORING_POLICY,
  parseTutoringPolicy,
  STANDARD_TUTORING_POLICY,
  type TutoringPolicy,
} from '@tuturuuu/internal-api/tutoring-policy';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { TutoringGroupShifts } from './tutoring-group-shifts';
import {
  type PolicySectionId,
  TutoringPolicySection,
} from './tutoring-policy-section';
import { TutoringShiftRulesEditor } from './tutoring-shift-rules-editor';
import { TutoringWeakRules } from './tutoring-weak-rules';

interface Props {
  canConfigure: boolean;
  groups: UserGroup[];
  policy: TutoringPolicy;
  wsId: string;
}

const NUMERIC_FIELDS = [
  ['durationMinutes', 1, 480],
  ['leadMinutes', 0, 480],
  ['weakSupportSessions', 1, 6],
  ['absenceLookbackDays', 1, 365],
  ['reassessmentDays', 1, 90],
  ['followUpDays', 1, 90],
  ['schedulingHorizonDays', 1, 180],
] as const;

export function TutoringPolicyCard({
  canConfigure,
  groups,
  policy,
  wsId,
}: Props) {
  const t = useTranslations('ws-tutoring');
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<TutoringPolicy>(policy);
  const [editing, setEditing] = useState<PolicySectionId | null>(null);
  const sectionFields: Record<
    Exclude<PolicySectionId, 'presets'>,
    (keyof TutoringPolicy)[]
  > = {
    timing: NUMERIC_FIELDS.map(([field]) => field),
    exceptions: ['timeRules'],
    groupShifts: ['shiftByGroupId'],
    weak: ['weakContentReviewDays', 'groupExclusions'],
    campuses: ['campusByGroupId'],
    message: ['parentMessageTemplate'],
  };
  const submittedPolicy =
    !editing || editing === 'presets'
      ? draft
      : {
          ...policy,
          ...Object.fromEntries(
            sectionFields[editing].map((field) => [field, draft[field]])
          ),
          preset: 'custom' as const,
        };
  const changed =
    editing === 'presets'
      ? JSON.stringify(draft) !== JSON.stringify(policy)
      : Boolean(
          editing &&
            sectionFields[editing].some(
              (field) =>
                JSON.stringify(draft[field]) !== JSON.stringify(policy[field])
            )
        );
  const valid = Boolean(parseTutoringPolicy(submittedPolicy));
  const save = useMutation({
    mutationFn: (submitted: TutoringPolicy) =>
      updateTutoringPolicy(wsId, submitted),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['tutoring-policy', wsId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['tutoring-queue', wsId],
      });
      setEditing(null);
      toast.success(t('policy_saved'));
    },
    onError: () => toast.error(t('policy_save_failed')),
  });

  const edit = (next: Partial<TutoringPolicy>) =>
    setDraft((current) => ({ ...current, ...next, preset: 'custom' }));

  const sectionProps = {
    canConfigure,
    changed,
    editing,
    groups,
    policy,
    pending: save.isPending,
    valid,
    onEdit: (id: PolicySectionId) => {
      setDraft(policy);
      setEditing(id);
    },
    onCancel: () => {
      setDraft(policy);
      setEditing(null);
    },
    onSave: () => save.mutate(submittedPolicy),
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg tracking-tight">
            {t('policy_title')}
          </h2>
          <p className="max-w-2xl text-muted-foreground text-sm">
            {t('policy_description')}
          </p>
        </div>
      </div>

      <TutoringPolicySection {...sectionProps} id="presets">
        <div>
          <h3 className="font-medium">{t('policy_presets')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('policy_presets_description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!canConfigure}
            onClick={() =>
              setDraft({
                ...STANDARD_TUTORING_POLICY,
                campusByGroupId: draft.campusByGroupId,
                shiftByGroupId: draft.shiftByGroupId,
              })
            }
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
                campusByGroupId: draft.campusByGroupId,
                shiftByGroupId: draft.shiftByGroupId,
                timeRules: EASY_CENTER_TUTORING_POLICY.timeRules.map(
                  (rule) => ({
                    ...rule,
                    weekdays: [...rule.weekdays],
                    ...(rule.classWeekdays
                      ? { classWeekdays: [...rule.classWeekdays] }
                      : {}),
                  })
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
      </TutoringPolicySection>

      <TutoringPolicySection {...sectionProps} id="timing">
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
      </TutoringPolicySection>

      <TutoringPolicySection {...sectionProps} id="exceptions">
        <TutoringShiftRulesEditor
          canConfigure={canConfigure}
          onChange={edit}
          policy={draft}
        />
      </TutoringPolicySection>

      <TutoringPolicySection {...sectionProps} id="groupShifts">
        <TutoringGroupShifts
          canConfigure={canConfigure}
          groups={groups}
          onChange={edit}
          policy={draft}
        />
      </TutoringPolicySection>

      <TutoringPolicySection {...sectionProps} id="weak">
        <TutoringWeakRules
          canConfigure={canConfigure}
          onChange={edit}
          policy={draft}
        />
      </TutoringPolicySection>

      <TutoringPolicySection {...sectionProps} id="campuses">
        <div>
          <h3 className="font-medium">{t('policy_campuses')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('policy_campuses_description')}
          </p>
        </div>
        {Object.entries(draft.campusByGroupId).map(([groupId, name]) => (
          <div className="flex items-end gap-2" key={groupId}>
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor={`policy-campus-${groupId}`}>
                {groups.find((group) => group.id === groupId)?.name ?? groupId}
              </Label>
              <Input
                disabled={!canConfigure}
                id={`policy-campus-${groupId}`}
                maxLength={80}
                onChange={(event) =>
                  edit({
                    campusByGroupId: {
                      ...draft.campusByGroupId,
                      [groupId]: event.target.value,
                    },
                  })
                }
                placeholder={t('policy_campus_name')}
                value={name}
              />
            </div>
            {canConfigure ? (
              <Button
                aria-label={t('policy_remove_campus')}
                onClick={() => {
                  const next = { ...draft.campusByGroupId };
                  delete next[groupId];
                  edit({ campusByGroupId: next });
                }}
                size="icon"
                variant="ghost"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ))}
        {canConfigure ? (
          <Combobox
            emptyText={t('no_groups')}
            onChange={(value) =>
              edit({
                campusByGroupId: {
                  ...draft.campusByGroupId,
                  [value as string]: '',
                },
              })
            }
            options={groups
              .filter((group) => !(group.id in draft.campusByGroupId))
              .map((group) => ({
                label: group.name || group.id,
                value: group.id,
              }))}
            placeholder={t('policy_add_campus')}
            searchPlaceholder={t('search_groups')}
            selected=""
          />
        ) : null}
      </TutoringPolicySection>

      <TutoringPolicySection {...sectionProps} id="message">
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
      </TutoringPolicySection>
      {editing && !valid ? (
        <p className="text-destructive text-sm" role="alert">
          {t('policy_invalid')}
        </p>
      ) : null}
    </section>
  );
}
