'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Trash2 } from '@tuturuuu/icons';
import {
  createWorkspaceTaskBoardCapacityRule,
  deleteWorkspaceTaskBoardCapacityRule,
  listWorkspaceLabels,
  listWorkspaceTaskBoardCapacityRules,
  listWorkspaceTaskProjects,
  type TaskCapacityCountingMode,
  type TaskCapacityEnforcement,
  type TaskCapacityMatchMode,
  type TaskCapacityMetric,
  updateWorkspaceTaskBoardCapacityRule,
} from '@tuturuuu/internal-api/tasks';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

function browserOptions() {
  return typeof window === 'undefined'
    ? undefined
    : { baseUrl: window.location.origin };
}

export function CapacityRulesSettings({
  boardId,
  initialListId,
  lists,
  wsId,
}: {
  boardId: string;
  initialListId?: string;
  lists: TaskList[];
  wsId: string;
}) {
  const t = useTranslations('ws-board-templates.capacity');
  const queryClient = useQueryClient();
  const queryKey = ['task-capacity-rules', wsId, boardId] as const;
  const [creating, setCreating] = useState(Boolean(initialListId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [limit, setLimit] = useState(5);
  const [metric, setMetric] = useState<TaskCapacityMetric>('task_count');
  const [enforcement, setEnforcement] =
    useState<TaskCapacityEnforcement>('soft');
  const [countingMode, setCountingMode] =
    useState<TaskCapacityCountingMode>('active');
  const [labelMatchMode, setLabelMatchMode] =
    useState<TaskCapacityMatchMode>('any');
  const [projectMatchMode, setProjectMatchMode] =
    useState<TaskCapacityMatchMode>('any');
  const [search, setSearch] = useState('');
  const [listIds, setListIds] = useState<string[]>(
    initialListId ? [initialListId] : []
  );
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);

  function resetDraft() {
    setEditingId(null);
    setName('');
    setLimit(5);
    setMetric('task_count');
    setEnforcement('soft');
    setCountingMode('active');
    setLabelMatchMode('any');
    setProjectMatchMode('any');
    setSearch('');
    setListIds(initialListId ? [initialListId] : []);
    setLabelIds([]);
    setProjectIds([]);
  }

  function toggleCreateEditor() {
    if (creating) {
      setCreating(false);
      resetDraft();
      return;
    }

    resetDraft();
    setCreating(true);
  }

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
    queryKey: ['task-projects-settings', wsId],
    queryFn: () => listWorkspaceTaskProjects(wsId, browserOptions()),
  });
  const rules = rulesQuery.data?.rules ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const selectorGroups = useMemo(
    () => [
      {
        key: 'lists',
        title: t('lists'),
        items: lists.map((item) => ({
          id: item.id,
          name: item.name ?? t('untitled'),
        })),
        selected: listIds,
        setSelected: setListIds,
      },
      {
        key: 'labels',
        title: t('labels'),
        items: labelsQuery.data ?? [],
        selected: labelIds,
        setSelected: setLabelIds,
      },
      {
        key: 'projects',
        title: t('projects'),
        items: projectsQuery.data ?? [],
        selected: projectIds,
        setSelected: setProjectIds,
      },
    ],
    [
      labelIds,
      labelsQuery.data,
      listIds,
      lists,
      projectIds,
      projectsQuery.data,
      t,
    ]
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        limitValue: limit,
        metric,
        enforcement,
        countingMode,
        labelMatchMode,
        projectMatchMode,
        listIds,
        labelIds,
        projectIds,
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
      setCreating(false);
      resetDraft();
      void refresh();
      toast.success(t('saved'));
    },
    onError: () => toast.error(t('save_failed')),
  });
  function editRule(rule: (typeof rules)[number]) {
    setEditingId(rule.id);
    setCreating(true);
    setName(rule.name);
    setLimit(rule.limit_value);
    setMetric(rule.metric);
    setEnforcement(rule.enforcement);
    setCountingMode(rule.counting_mode);
    setLabelMatchMode(rule.label_match_mode);
    setProjectMatchMode(rule.project_match_mode);
    setListIds(rule.list_ids);
    setLabelIds(rule.label_ids);
    setProjectIds(rule.project_ids);
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

  return (
    <section className="space-y-4 rounded-2xl border bg-background p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{t('title')}</h3>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
        <Button size="sm" variant="outline" onClick={toggleCreateEditor}>
          <Plus className="h-4 w-4" />
          {t('add')}
        </Button>
      </div>

      {rulesQuery.isLoading ? (
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
      ) : rules.length === 0 && !creating ? (
        <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
          {t('empty')}
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => {
            const exceeded = rule.current_value > rule.limit_value;
            return (
              <div
                key={rule.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
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
      )}

      {creating && (
        <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_7rem_10rem_10rem]">
            <div>
              <Label htmlFor="capacity-name">{t('name')}</Label>
              <Input
                id="capacity-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="capacity-limit">{t('limit')}</Label>
              <Input
                id="capacity-limit"
                type="number"
                min={1}
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="capacity-metric">{t('metric')}</Label>
              <select
                id="capacity-metric"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={metric}
                onChange={(event) =>
                  setMetric(event.target.value as TaskCapacityMetric)
                }
              >
                <option value="task_count">{t('task_count')}</option>
                <option value="estimation_points">
                  {t('estimation_points')}
                </option>
              </select>
            </div>
            <div>
              <Label htmlFor="capacity-enforcement">{t('enforcement')}</Label>
              <select
                id="capacity-enforcement"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={enforcement}
                onChange={(event) =>
                  setEnforcement(event.target.value as TaskCapacityEnforcement)
                }
              >
                <option value="soft">{t('soft')}</option>
                <option value="hard">{t('hard')}</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="capacity-selector-search">
              {t('search_selectors')}
            </Label>
            <Input
              id="capacity-selector-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('search_placeholder')}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="capacity-counting">{t('counting_mode')}</Label>
              <select
                id="capacity-counting"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={countingMode}
                onChange={(event) =>
                  setCountingMode(
                    event.target.value as TaskCapacityCountingMode
                  )
                }
              >
                <option value="active">{t('active')}</option>
                <option value="all_non_deleted">{t('all_non_deleted')}</option>
              </select>
            </div>
            <div>
              <Label htmlFor="capacity-label-match">
                {t('label_matching')}
              </Label>
              <select
                id="capacity-label-match"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={labelMatchMode}
                onChange={(event) =>
                  setLabelMatchMode(event.target.value as TaskCapacityMatchMode)
                }
              >
                <option value="any">{t('any')}</option>
                <option value="all">{t('all')}</option>
              </select>
            </div>
            <div>
              <Label htmlFor="capacity-project-match">
                {t('project_matching')}
              </Label>
              <select
                id="capacity-project-match"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={projectMatchMode}
                onChange={(event) =>
                  setProjectMatchMode(
                    event.target.value as TaskCapacityMatchMode
                  )
                }
              >
                <option value="any">{t('any')}</option>
                <option value="all">{t('all')}</option>
              </select>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {selectorGroups.map((group) => (
              <div key={group.key} className="space-y-1">
                <div className="font-medium text-xs">{group.title}</div>
                <div className="max-h-36 space-y-1 overflow-auto rounded-md border p-2">
                  {group.items
                    .filter(
                      (item) =>
                        !normalizedSearch ||
                        item.name.toLowerCase().includes(normalizedSearch)
                    )
                    .map((item) => {
                      const selected = group.selected.includes(item.id);
                      return (
                        <button
                          type="button"
                          key={item.id}
                          className={`block w-full rounded px-2 py-1 text-left text-xs ${selected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                          onClick={() =>
                            group.setSelected(
                              selected
                                ? group.selected.filter((id) => id !== item.id)
                                : [...group.selected, item.id]
                            )
                          }
                        >
                          {item.name}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setCreating(false);
                resetDraft();
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              disabled={!name.trim() || limit < 1 || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {t('save')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
