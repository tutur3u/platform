'use client';

import { Box, Plus, Tag, Users } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { QuickCreateChip } from './quick-create-chip';
import { QuickCreateOptionPicker } from './quick-create-option-picker';
import type { QuickCreatePropertyChipsProps } from './quick-create-property-chips';
import {
  getAssigneeOptions,
  getLabelOptions,
  getProjectOptions,
  QuickCreateAssigneesValue,
  QuickCreateLabelsValue,
  QuickCreateProjectsValue,
} from './quick-create-property-options';
import type { QuickCreateChipId } from './quick-create-values';

interface QuickCreateCollectionChipsProps extends QuickCreatePropertyChipsProps {
  chipState: (id: QuickCreateChipId) => {
    open: boolean;
    disabled?: boolean;
    onOpenChange: (open: boolean) => void;
  };
  close: () => void;
  emptyValue: string;
  searchPlaceholder: string;
  noResults: string;
}

/** The multi-select chips: Labels, Project and Assignees. */
export function QuickCreateCollectionChips({
  chipState,
  close,
  emptyValue,
  searchPlaceholder,
  noResults,
  ...props
}: QuickCreateCollectionChipsProps) {
  const t = useTranslations();
  const tq = useTranslations('ws-task-boards.dialog.quick_create');

  return (
    <>
      <QuickCreateChip
        id="labels"
        icon={Tag}
        label={tq('labels')}
        value={
          props.selectedLabels.length > 0 ? (
            <QuickCreateLabelsValue labels={props.selectedLabels} />
          ) : null
        }
        emptyValue={emptyValue}
        contentClassName="w-72"
        {...chipState('labels')}
      >
        <QuickCreateOptionPicker
          options={getLabelOptions(props.availableLabels)}
          selectedIds={props.selectedLabels.map((label) => label.id)}
          searchPlaceholder={searchPlaceholder}
          emptyLabel={noResults}
          onSelect={(id) => {
            const label =
              props.selectedLabels.find((item) => item.id === id) ??
              props.availableLabels.find((item) => item.id === id);
            if (label) props.onLabelToggle(label);
          }}
          action={{
            label: t('ws-task-boards.dialog.create_new_label'),
            icon: Plus,
            onSelect: () => {
              close();
              props.onShowNewLabelDialog();
            },
          }}
        />
      </QuickCreateChip>
      {props.isDraftMode ? null : (
        <QuickCreateChip
          id="project"
          icon={Box}
          label={tq('project')}
          value={
            props.selectedProjects.length > 0 ? (
              <QuickCreateProjectsValue projects={props.selectedProjects} />
            ) : null
          }
          emptyValue={emptyValue}
          contentClassName="w-72"
          {...chipState('project')}
        >
          <QuickCreateOptionPicker
            options={getProjectOptions(props.taskProjects)}
            selectedIds={props.selectedProjects.map((project) => project.id)}
            searchPlaceholder={searchPlaceholder}
            emptyLabel={noResults}
            onSelect={(id) => {
              const project =
                props.selectedProjects.find((item) => item.id === id) ??
                props.taskProjects.find((item) => item.id === id);
              if (project) props.onProjectToggle(project);
            }}
            action={{
              label: t('ws-task-boards.dialog.create_new_project'),
              icon: Plus,
              onSelect: () => {
                close();
                props.onShowNewProjectDialog();
              },
            }}
          />
        </QuickCreateChip>
      )}
      {(props.canUseBoardAssignees ?? !props.isPersonalWorkspace) ? (
        <QuickCreateChip
          id="assignees"
          icon={Users}
          label={tq('assignees')}
          value={
            props.selectedAssignees.length > 0 ? (
              <QuickCreateAssigneesValue
                assignees={props.selectedAssignees}
                fallbackName={t('ws-task-boards.dialog.unknown_user')}
              />
            ) : null
          }
          emptyValue={emptyValue}
          contentClassName="w-72"
          {...chipState('assignees')}
        >
          <QuickCreateOptionPicker
            options={getAssigneeOptions(
              props.workspaceMembers,
              t('ws-task-boards.dialog.unknown_user')
            )}
            selectedIds={props.selectedAssignees.map(
              (assignee) => assignee.id || assignee.user_id || ''
            )}
            searchPlaceholder={searchPlaceholder}
            emptyLabel={noResults}
            onSelect={(id) => {
              const assignee =
                props.selectedAssignees.find(
                  (item) => (item.id || item.user_id) === id
                ) ??
                props.workspaceMembers.find(
                  (item) => (item.user_id || item.id) === id
                );
              if (assignee) props.onAssigneeToggle(assignee);
            }}
          />
        </QuickCreateChip>
      ) : null}
    </>
  );
}
