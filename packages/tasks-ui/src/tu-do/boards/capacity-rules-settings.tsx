'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Trash2 } from '@tuturuuu/icons';
import {
  createWorkspaceTaskBoardCapacityRule,
  deleteWorkspaceTaskBoardCapacityRule,
  listWorkspaceLabels,
  listWorkspaceTaskBoardCapacityRules,
  listWorkspaceTaskProjects,
  updateWorkspaceTaskBoardCapacityRule,
} from '@tuturuuu/internal-api/tasks';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SettingsGroup } from '../shared/settings-group';
import {
  type CapacityDraft,
  CapacityRuleEditor,
  createEmptyDraft,
  type SelectorGroup,
} from './capacity-rule-editor';

function browserOptions() {
  return typeof window === 'undefined'
    ? undefined
    : { baseUrl: window.location.origin };
}

export function CapacityRulesSettings({
  boardId,
  embedded = false,
  initialListId,
  lists,
  wsId,
}: {
  boardId: string;
  /**
   * Drop the card chrome when the caller already provides a surface — a dialog
   * draws its own border, and nesting the section's border inside it is the
   * doubled edge this used to render.
   */
  embedded?: boolean;
  initialListId?: string;
  lists: TaskList[];
  wsId: string;
}) {
  const t = useTranslations('ws-board-templates.capacity');
  const queryClient = useQueryClient();
  const queryKey = ['task-capacity-rules', wsId, boardId] as const;
  const [editorDraft, setEditorDraft] = useState<CapacityDraft | null>(
    initialListId ? createEmptyDraft(initialListId) : null
  );
  const [editingId, setEditingId] = useState<string | null>(null);

  const rulesQuery = useQuery({
    queryKey,
    queryFn: () =>
      listWorkspaceTaskBoardCapacityRules(wsId, boardId, browserOptions()),
  });
  const labelsQuery = useQuery({
    queryKey: ['task-labels-settings', wsId],
    queryFn: () => listWorkspaceLabels(wsId, browserOptions()),
  });
  const projectsQuery = useQuery({
    // The Projects panel caches full project details under the bare key.
    queryKey: ['task-projects-settings', wsId, 'compact'],
    queryFn: () => listWorkspaceTaskProjects(wsId, browserOptions()),
  });
  const rules = rulesQuery.data?.rules ?? [];

  const selectorGroups = useMemo<SelectorGroup[]>(
    () => [
      {
        key: 'lists',
        title: t('lists'),
        items: lists.map((item) => ({
          id: item.id,
          name: item.name ?? t('untitled'),
        })),
      },
      {
        key: 'labels',
        title: t('labels'),
        items: labelsQuery.data ?? [],
      },
      {
        key: 'projects',
        title: t('projects'),
        items: projectsQuery.data ?? [],
      },
    ],
    [labelsQuery.data, lists, projectsQuery.data, t]
  );

  function closeEditor() {
    setEditorDraft(null);
    setEditingId(null);
  }

  function toggleCreateEditor() {
    if (editorDraft) {
      closeEditor();
      return;
    }

    setEditingId(null);
    setEditorDraft(createEmptyDraft(initialListId));
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const saveMutation = useMutation({
    mutationFn: (draft: CapacityDraft) => {
      const payload = {
        name: draft.name,
        limitValue: draft.limit,
        metric: draft.metric,
        enforcement: draft.enforcement,
        countingMode: draft.countingMode,
        labelMatchMode: draft.labelMatchMode,
        projectMatchMode: draft.projectMatchMode,
        listIds: draft.listIds,
        labelIds: draft.labelIds,
        projectIds: draft.projectIds,
      };
      return editingId
        ? updateWorkspaceTaskBoardCapacityRule(
            wsId,
            boardId,
            editingId,
            payload,
            browserOptions()
          )
        : createWorkspaceTaskBoardCapacityRule(
            wsId,
            boardId,
            payload,
            browserOptions()
          );
    },
    onSuccess: () => {
      closeEditor();
      void refresh();
      toast.success(t('saved'));
    },
    onError: () => toast.error(t('save_failed')),
  });

  function editRule(rule: (typeof rules)[number]) {
    setEditingId(rule.id);
    setEditorDraft({
      countingMode: rule.counting_mode,
      enforcement: rule.enforcement,
      labelIds: rule.label_ids,
      labelMatchMode: rule.label_match_mode,
      limit: rule.limit_value,
      listIds: rule.list_ids,
      metric: rule.metric,
      name: rule.name,
      projectIds: rule.project_ids,
      projectMatchMode: rule.project_match_mode,
    });
  }

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateWorkspaceTaskBoardCapacityRule(
        wsId,
        boardId,
        id,
        { enabled },
        browserOptions()
      ),
    onSuccess: () => void refresh(),
    onError: () => toast.error(t('save_failed')),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      deleteWorkspaceTaskBoardCapacityRule(wsId, boardId, id, browserOptions()),
    onSuccess: () => {
      void refresh();
      toast.success(t('deleted'));
    },
    onError: () => toast.error(t('delete_failed')),
  });

  const addButton = (
    <Button size="sm" variant="outline" onClick={toggleCreateEditor}>
      <Plus className="h-4 w-4" />
      {t('add')}
    </Button>
  );

  const body = rulesQuery.isLoading ? (
    <Loader2 className="h-5 w-5 animate-spin" />
  ) : rulesQuery.isError ? (
    <div className="rounded-md border border-destructive/40 p-3 text-sm">
      <p>{t('load_failed')}</p>
      <Button
        size="sm"
        variant="outline"
        className="mt-2"
        onClick={() => void rulesQuery.refetch()}
      >
        {t('retry')}
      </Button>
    </div>
  ) : rules.length === 0 && !editorDraft ? (
    <p
      className={cn(
        'text-muted-foreground text-sm',
        embedded && 'rounded-md border border-dashed p-4'
      )}
    >
      {t('empty')}
    </p>
  ) : (
    <div className={cn(embedded ? 'space-y-2' : 'divide-y')}>
      {rules.map((rule) => {
        const exceeded = rule.current_value > rule.limit_value;
        return (
          <div
            key={rule.id}
            className={cn(
              'flex flex-wrap items-center gap-3',
              embedded ? 'rounded-lg border p-3' : 'py-3 first:pt-0 last:pb-0'
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium text-sm">
                  {rule.name}
                </span>
                <Badge variant={exceeded ? 'destructive' : 'secondary'}>
                  {rule.current_value} / {rule.limit_value}
                </Badge>
                <Badge variant="outline">{t(rule.enforcement)}</Badge>
                <Badge variant="outline">{t(rule.metric)}</Badge>
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                {t(rule.counting_mode)} ·{' '}
                {t('selector_count', {
                  count:
                    rule.list_ids.length +
                    rule.label_ids.length +
                    rule.project_ids.length,
                })}
              </p>
            </div>
            <Switch
              checked={rule.enabled}
              aria-label={t('enabled')}
              onCheckedChange={(enabled) =>
                toggleMutation.mutate({ id: rule.id, enabled })
              }
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('edit')}
              onClick={() => editRule(rule)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('delete')}
              onClick={() => deleteMutation.mutate(rule.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );

  const editor = editorDraft ? (
    <CapacityRuleEditor
      key={editingId ?? 'new'}
      initialDraft={editorDraft}
      isSaving={saveMutation.isPending}
      onCancel={closeEditor}
      onSubmit={(draft) => saveMutation.mutate(draft)}
      selectorGroups={selectorGroups}
    />
  ) : null;

  if (!embedded) {
    return (
      <SettingsGroup
        action={addButton}
        description={t('description')}
        title={t('title')}
      >
        <div className="p-4">{body}</div>
        {editor ? <div className="p-4">{editor}</div> : null}
      </SettingsGroup>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{t('title')}</h3>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        {addButton}
      </div>
      {body}
      {editor}
    </section>
  );
}
