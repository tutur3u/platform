'use client';

import {
  Calendar,
  ChevronDown,
  Flag,
  Link2,
  Tag,
  Timer,
  UserRoundCog,
  Users,
} from '@tuturuuu/icons';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';
import { PRIORITY_BADGE_COLORS } from '../../utils/taskConstants';
import { getPriorityIcon } from '../../utils/taskPriorityUtils';
import { useTaskOverrides } from './hooks/use-task-overrides';

export type TaskDetailsTab = 'properties' | 'personal' | 'relationships';

export interface TaskDetailsSectionProps {
  /** Rendered inside the Properties tab. */
  properties: ReactNode;
  /** Rendered inside the Personal tab; omit to hide the tab entirely. */
  personal?: ReactNode;
  /** Rendered inside the Relationships tab; omit to hide the tab entirely. */
  relationships?: ReactNode;
  taskId?: string;
  priority?: TaskPriority | null;
  endDate?: Date;
  startDate?: Date;
  estimationPoints?: number | null;
  labelCount: number;
  assigneeCount: number;
  relationshipCount: number;
  defaultTab?: TaskDetailsTab;
}

interface SummaryChipProps {
  children: ReactNode;
  className?: string;
  icon: ReactNode;
}

function SummaryChip({ children, className, icon }: SummaryChipProps) {
  return (
    <Badge
      className={cn(
        'h-[1.125rem] shrink-0 gap-1 border px-1.5 font-medium text-[10px]',
        className ?? 'border-border bg-muted/50 text-muted-foreground'
      )}
      variant="secondary"
    >
      {icon}
      {children}
    </Badge>
  );
}

/**
 * One collapsible home for everything that describes a task.
 *
 * Properties, personal overrides and relationships used to be three stacked
 * collapsibles, which meant three chevrons, three headers and three decisions
 * before reaching the description. They are now a single "Details" disclosure:
 * collapsed it is one row that summarizes the task at a glance, expanded it is
 * one panel with a segmented control between the three groups.
 */
export function TaskDetailsSection({
  properties,
  personal,
  relationships,
  taskId,
  priority,
  startDate,
  endDate,
  estimationPoints,
  labelCount,
  assigneeCount,
  relationshipCount,
  defaultTab = 'properties',
}: TaskDetailsSectionProps) {
  const t = useTranslations();
  const panelId = useId();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TaskDetailsTab>(defaultTab);
  const { override } = useTaskOverrides(taskId);
  const selfManaged = override?.self_managed ?? false;

  const tabs = [
    {
      content: properties,
      id: 'properties' as const,
      label: t('ws-task-boards.dialog.properties'),
    },
    ...(personal
      ? [
          {
            content: personal,
            id: 'personal' as const,
            label: t('ws-tasks.personal_overrides'),
          },
        ]
      : []),
    ...(relationships
      ? [
          {
            content: relationships,
            id: 'relationships' as const,
            count: relationshipCount,
            label: t('ws-task-boards.dialog.relationships'),
          },
        ]
      : []),
  ];

  const activeTabContent =
    tabs.find((tab) => tab.id === activeTab)?.content ?? properties;
  const dateLabel = endDate ?? startDate;

  return (
    <div className="border-y bg-muted/30">
      <button
        aria-controls={panelId}
        aria-expanded={isExpanded}
        // Deliberately tight: collapsed, this is a one-line summary that should
        // cost as little vertical space as possible above the description. The
        // min-h keeps it stable whether it shows chips or the empty hint.
        className="flex min-h-8 w-full items-center gap-1.5 px-4 py-1 text-left transition-colors hover:bg-muted/50 md:px-8"
        onClick={() => setIsExpanded((expanded) => !expanded)}
        type="button"
      >
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
            !isExpanded && '-rotate-90'
          )}
        />
        <span className="shrink-0 font-semibold text-foreground text-xs">
          {t('ws-task-boards.dialog.details')}
        </span>

        {!isExpanded && (
          <div className="scrollbar-hide ml-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            {priority && (
              <SummaryChip
                className={PRIORITY_BADGE_COLORS[priority]}
                icon={getPriorityIcon(priority, 'h-2.5 w-2.5')}
              >
                {t(`tasks.priority_${priority}`)}
              </SummaryChip>
            )}
            {dateLabel && (
              <SummaryChip
                className="border-dynamic-orange/30 bg-dynamic-orange/15 text-dynamic-orange"
                icon={<Calendar className="h-2.5 w-2.5" />}
              >
                {dateLabel.toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                })}
              </SummaryChip>
            )}
            {estimationPoints != null && (
              <SummaryChip
                className="border-dynamic-blue/30 bg-dynamic-blue/15 text-dynamic-blue"
                icon={<Timer className="h-2.5 w-2.5" />}
              >
                {estimationPoints}
              </SummaryChip>
            )}
            {labelCount > 0 && (
              <SummaryChip icon={<Tag className="h-2.5 w-2.5" />}>
                {labelCount}
              </SummaryChip>
            )}
            {assigneeCount > 0 && (
              <SummaryChip icon={<Users className="h-2.5 w-2.5" />}>
                {assigneeCount}
              </SummaryChip>
            )}
            {relationshipCount > 0 && (
              <SummaryChip icon={<Link2 className="h-2.5 w-2.5" />}>
                {relationshipCount}
              </SummaryChip>
            )}
            {selfManaged && (
              <SummaryChip
                className="border-dynamic-purple/30 bg-dynamic-purple/15 text-dynamic-purple"
                icon={<UserRoundCog className="h-2.5 w-2.5" />}
              >
                {t('ws-tasks.self_managed')}
              </SummaryChip>
            )}
            {!priority &&
              !dateLabel &&
              estimationPoints == null &&
              labelCount === 0 &&
              assigneeCount === 0 &&
              relationshipCount === 0 &&
              !selfManaged && (
                <span className="truncate text-muted-foreground text-xs">
                  {t('ws-task-boards.dialog.details_empty')}
                </span>
              )}
          </div>
        )}
      </button>

      {isExpanded && (
        <div className="border-t" id={panelId}>
          {tabs.length > 1 && (
            <div
              aria-label={t('ws-task-boards.dialog.details')}
              className="scrollbar-hide flex items-center gap-1 overflow-x-auto border-b px-4 py-2 md:px-8"
              role="tablist"
            >
              {tabs.map((tab) => {
                const isActive = tab.id === activeTab;

                return (
                  <button
                    aria-selected={isActive}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 font-medium text-xs transition-colors',
                      isActive
                        ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    )}
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    role="tab"
                    type="button"
                  >
                    {tab.id === 'properties' && <Flag className="h-3 w-3" />}
                    {tab.id === 'personal' && (
                      <UserRoundCog className="h-3 w-3" />
                    )}
                    {tab.id === 'relationships' && (
                      <Link2 className="h-3 w-3" />
                    )}
                    {tab.label}
                    {'count' in tab && tab.count ? (
                      <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                        {tab.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          <div className="px-4 py-3 md:px-8">{activeTabContent}</div>
        </div>
      )}
    </div>
  );
}
