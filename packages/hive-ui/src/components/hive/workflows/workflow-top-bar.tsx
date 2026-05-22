'use client';

import {
  Map as MapIcon,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Save,
} from '@tuturuuu/icons';
import type {
  HiveWorkflow,
  HiveWorkflowRun,
} from '@tuturuuu/internal-api/hive';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type { ComponentType, ReactNode } from 'react';

type WorkflowTopBarProps = {
  activeRun?: HiveWorkflowRun | null;
  draftDescription: string;
  draftName: string;
  isAdmin: boolean;
  leftCollapsed: boolean;
  onChangeDescription: (value: string) => void;
  onChangeName: (value: string) => void;
  onExitWorkflows: () => void;
  onRunWorkflow: () => void;
  onSaveWorkflow: () => void;
  onSelectWorkflow: (workflowId: string) => void;
  onToggleInspector: () => void;
  onTogglePalette: () => void;
  onToggleTrace: () => void;
  rightCollapsed: boolean;
  runPending: boolean;
  selectedWorkflow: HiveWorkflow | null;
  serverPicker: ReactNode;
  traceCollapsed: boolean;
  validationErrors: string[];
  workflows: HiveWorkflow[];
};

export const NEW_WORKFLOW_ID = '__new__';

export function WorkflowTopBar({
  activeRun,
  draftDescription,
  draftName,
  isAdmin,
  leftCollapsed,
  onChangeDescription,
  onChangeName,
  onExitWorkflows,
  onRunWorkflow,
  onSaveWorkflow,
  onSelectWorkflow,
  onToggleInspector,
  onTogglePalette,
  onToggleTrace,
  rightCollapsed,
  runPending,
  selectedWorkflow,
  serverPicker,
  traceCollapsed,
  validationErrors,
  workflows,
}: WorkflowTopBarProps) {
  const t = useTranslations('studio.workflows');

  return (
    <header className="group/hive-top-toolbar flex shrink-0 flex-wrap items-center gap-2 border-border/70 border-b bg-background/95 px-3 py-2 backdrop-blur-xl">
      <ToolbarIconButton
        icon={MapIcon}
        label={t('chrome.back_to_world')}
        onClick={onExitWorkflows}
      />
      {serverPicker}
      <div className="flex min-w-[18rem] flex-1 items-center gap-2 rounded-lg border border-border/70 bg-muted/20 p-1">
        <select
          aria-label={t('select_workflow')}
          className="h-8 w-44 shrink-0 rounded-md border border-border/70 bg-background px-2 text-sm"
          onChange={(event) => onSelectWorkflow(event.target.value)}
          value={selectedWorkflow?.id ?? NEW_WORKFLOW_ID}
        >
          <option value={NEW_WORKFLOW_ID}>{t('new_workflow')}</option>
          {workflows.map((workflow) => (
            <option key={workflow.id} value={workflow.id}>
              {workflow.name}
            </option>
          ))}
        </select>
        <Input
          aria-label={t('name')}
          className="h-8 min-w-36 flex-1 border-transparent bg-transparent px-1 font-semibold text-sm shadow-none focus-visible:ring-0"
          disabled={!isAdmin}
          onChange={(event) => onChangeName(event.target.value)}
          value={draftName}
        />
        <Input
          aria-label={t('description')}
          className="hidden h-8 max-w-72 border-transparent bg-transparent px-1 text-muted-foreground text-xs shadow-none focus-visible:ring-0 lg:block"
          disabled={!isAdmin}
          onChange={(event) => onChangeDescription(event.target.value)}
          placeholder={t('description')}
          value={draftDescription}
        />
      </div>
      <WorkflowRunSummary activeRun={activeRun} />
      <div className="ml-auto flex items-center gap-1">
        <ToolbarIconButton
          active={!leftCollapsed}
          icon={leftCollapsed ? PanelLeftOpen : PanelLeftClose}
          label={t('toggle_palette')}
          onClick={onTogglePalette}
        />
        <ToolbarIconButton
          active={!rightCollapsed}
          icon={rightCollapsed ? PanelRightOpen : PanelRightClose}
          label={t('toggle_inspector')}
          onClick={onToggleInspector}
        />
        <ToolbarIconButton
          active={!traceCollapsed}
          icon={traceCollapsed ? PanelBottomOpen : PanelBottomClose}
          label={t('toggle_trace')}
          onClick={onToggleTrace}
        />
        <Button
          className="h-9"
          disabled={!isAdmin || validationErrors.length > 0}
          onClick={onSaveWorkflow}
          type="button"
        >
          <Save className="mr-2 h-4 w-4" />
          {t('save')}
        </Button>
        <Button
          className="h-9"
          disabled={!selectedWorkflow || runPending}
          onClick={onRunWorkflow}
          type="button"
          variant="secondary"
        >
          <Play className="mr-2 h-4 w-4" />
          {runPending ? t('running') : t('run')}
        </Button>
      </div>
    </header>
  );
}

function WorkflowRunSummary({
  activeRun,
}: {
  activeRun?: HiveWorkflowRun | null;
}) {
  const t = useTranslations('studio.workflows.run_panel');

  return (
    <fieldset className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-background px-2 text-xs">
      <legend className="sr-only">{t('title')}</legend>
      <span className="hidden font-medium text-muted-foreground sm:inline">
        {t('title')}
      </span>
      {activeRun ? (
        <>
          <Badge className="h-5 px-1.5 text-[11px]" variant="outline">
            {activeRun.status}
          </Badge>
          <span className="max-w-32 truncate font-mono text-muted-foreground">
            {activeRun.id}
          </span>
        </>
      ) : (
        <span className="truncate text-muted-foreground">{t('empty')}</span>
      )}
    </fieldset>
  );
}

function ToolbarIconButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          aria-pressed={active}
          className={[
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-[background-color,border-color,color,transform] duration-200 ease-out hover:-translate-y-0.5',
            active
              ? 'border-dynamic-green/60 bg-dynamic-green/10 text-dynamic-green'
              : 'border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground',
          ].join(' ')}
          onClick={onClick}
          type="button"
        >
          <Icon className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
