'use client';

import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { resolveUserDisplayName } from '@tuturuuu/utils/name-helper';
import { getPriorityIcon } from '../../../../utils/taskPriorityUtils';
import { LabelChip } from '../../../label-chip';
import { UserAvatar } from '../../../user-avatar';
import type { WorkspaceTaskLabel } from '../../types';
import type { QuickCreateOption } from './quick-create-option-picker';

export interface QuickCreateProject {
  id: string;
  name?: string | null;
}

export interface QuickCreateAssignee {
  id?: string | null;
  user_id?: string | null;
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

const PRIORITY_OPTIONS: ReadonlyArray<{
  value: TaskPriority;
  tone: string;
}> = [
  { value: 'critical', tone: 'text-dynamic-red' },
  { value: 'high', tone: 'text-dynamic-orange' },
  { value: 'normal', tone: 'text-dynamic-yellow' },
  { value: 'low', tone: 'text-dynamic-blue' },
];

/** Literal message keys, so every app's typed messages accept them. */
/** Literal message keys, so every app's typed messages accept them. */
export function priorityLabelKey(priority: string) {
  switch (priority) {
    case 'critical':
      return 'tasks.priority_critical' as const;
    case 'high':
      return 'tasks.priority_high' as const;
    case 'low':
      return 'tasks.priority_low' as const;
    default:
      return 'tasks.priority_normal' as const;
  }
}

export function getPriorityOptions(
  getLabel: (priority: TaskPriority) => string
): QuickCreateOption[] {
  return PRIORITY_OPTIONS.map(({ value, tone }) => ({
    id: value,
    label: getLabel(value),
    leading: getPriorityIcon(value, `size-4 shrink-0 ${tone}`),
  }));
}

export function getLabelOptions(
  labels: readonly WorkspaceTaskLabel[]
): QuickCreateOption[] {
  return labels.map((label) => ({
    id: label.id,
    label: label.name,
    content: (
      <LabelChip label={label} showIcon={false} className="h-6 px-2 text-xs" />
    ),
  }));
}

export function getProjectOptions(
  projects: readonly QuickCreateProject[]
): QuickCreateOption[] {
  return projects.map((project) => ({
    id: project.id,
    label: project.name ?? '',
  }));
}

function getMemberName(member: QuickCreateAssignee, fallback: string) {
  return resolveUserDisplayName(member, { fallback });
}

export function getAssigneeOptions(
  members: readonly QuickCreateAssignee[],
  fallbackName: string
): QuickCreateOption[] {
  return members.flatMap((member) => {
    const id = member.user_id || member.id;
    if (!id) return [];
    const name = getMemberName(member, fallbackName);
    return [
      {
        id,
        label: member.email ? `${name} ${member.email}` : name,
        content: name,
        leading: (
          <UserAvatar
            user={{
              display_name: name,
              avatar_url: member.avatar_url ?? undefined,
            }}
            size="sm"
            className="shrink-0 border"
          />
        ),
      },
    ];
  });
}

/** Up to two label pills, then a "+N" count. */
export function QuickCreateLabelsValue({
  labels,
}: {
  labels: readonly WorkspaceTaskLabel[];
}) {
  return (
    <>
      {labels.slice(0, 2).map((label) => (
        <LabelChip
          key={label.id}
          label={label}
          showIcon={false}
          className="h-5 max-w-24 px-1.5 text-xs"
        />
      ))}
      {labels.length > 2 ? (
        <span className="text-muted-foreground text-xs">
          +{labels.length - 2}
        </span>
      ) : null}
    </>
  );
}

export function QuickCreateProjectsValue({
  projects,
}: {
  projects: readonly QuickCreateProject[];
}) {
  const [first] = projects;
  return (
    <>
      <span className="truncate">{first?.name}</span>
      {projects.length > 1 ? (
        <span className="text-muted-foreground text-xs">
          +{projects.length - 1}
        </span>
      ) : null}
    </>
  );
}

export function QuickCreateAssigneesValue({
  assignees,
  fallbackName,
}: {
  assignees: readonly QuickCreateAssignee[];
  fallbackName: string;
}) {
  const [first] = assignees;
  if (!first) return null;
  return (
    <>
      <span className="truncate">{getMemberName(first, fallbackName)}</span>
      {assignees.length > 1 ? (
        <span className="text-muted-foreground text-xs">
          +{assignees.length - 1}
        </span>
      ) : null}
    </>
  );
}
