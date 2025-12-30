'use client';

import {
  ChevronRight,
  Edit2,
  Loader2,
  Settings,
  Sparkles,
  Target,
} from '@tuturuuu/icons';
import type { TaskProjectWithRelations } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import type { WorkspaceMember } from '@tuturuuu/ui/hooks/use-workspace-members';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { ProjectConfiguration } from './project-configuration';
import { ProjectSidebar } from './project-sidebar';
import type {
  ActiveTab,
  HealthStatus,
  ProjectUpdate,
  TaskPriority,
} from '../types';

interface OverviewTabProps {
  project: TaskProjectWithRelations;
  tasks: Task[];
  recentUpdates: ProjectUpdate[];
  isLoadingUpdates: boolean;
  setActiveTab: (tab: ActiveTab) => void;
  setShowLinkTaskDialog: (show: boolean) => void;
  // Description editing
  editedDescription: string;
  setEditedDescription: (value: string) => void;
  isEditingDescription: boolean;
  setIsEditingDescription: (value: boolean) => void;
  // Configuration
  showConfiguration: boolean;
  setShowConfiguration: (value: boolean) => void;
  editedStatus: string | null;
  setEditedStatus: (value: string) => void;
  editedPriority: TaskPriority | null;
  setEditedPriority: (value: TaskPriority | null) => void;
  editedHealthStatus: HealthStatus | null;
  setEditedHealthStatus: (value: HealthStatus | null) => void;
  editedLeadId: string | null;
  setEditedLeadId: (value: string | null) => void;
  editedStartDate: string;
  setEditedStartDate: (value: string) => void;
  editedEndDate: string;
  setEditedEndDate: (value: string) => void;
  editedArchived: boolean;
  setEditedArchived: (value: boolean) => void;
  // Sidebar
  showLeadSelector: boolean;
  setShowLeadSelector: (value: boolean) => void;
  showTimelineEditor: boolean;
  setShowTimelineEditor: (value: boolean) => void;
  // Members
  workspaceMembers: WorkspaceMember[];
  isLoadingMembers: boolean;
  // Animation
  fadeInViewVariant: (delay?: number) => object;
}

export function OverviewTab({
  project,
  tasks,
  recentUpdates,
  isLoadingUpdates,
  setActiveTab,
  setShowLinkTaskDialog,
  editedDescription,
  setEditedDescription,
  isEditingDescription,
  setIsEditingDescription,
  showConfiguration,
  setShowConfiguration,
  editedStatus,
  setEditedStatus,
  editedPriority,
  setEditedPriority,
  editedHealthStatus,
  setEditedHealthStatus,
  editedLeadId,
  setEditedLeadId,
  editedStartDate,
  setEditedStartDate,
  editedEndDate,
  setEditedEndDate,
  editedArchived,
  setEditedArchived,
  showLeadSelector,
  setShowLeadSelector,
  showTimelineEditor,
  setShowTimelineEditor,
  workspaceMembers,
  isLoadingMembers,
  fadeInViewVariant,
}: OverviewTabProps) {
  const t = useTranslations('task_project_detail.overview');
  const recentTasks = tasks.slice(0, 5);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Main content area */}
      <div className="space-y-6 lg:col-span-2">
        {/* Description Card */}
        <motion.div {...fadeInViewVariant(0)}>
          <Card className="group relative border-2 border-dynamic-purple/20 bg-dynamic-purple/5 p-6 transition-all hover:border-dynamic-purple/30 hover:shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="bg-linear-to-r from-dynamic-purple to-dynamic-pink bg-clip-text font-bold text-lg text-transparent">
                {t('description')}
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => setIsEditingDescription(true)}
                  aria-label={t('edit_description_aria')}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowConfiguration(!showConfiguration)}
                  className="border-dynamic-purple/30 transition-all hover:border-dynamic-purple/50 hover:bg-dynamic-purple/10"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  {showConfiguration
                    ? t('hide_configuration')
                    : t('show_configuration')}
                </Button>
              </div>
            </div>

            {isEditingDescription ? (
              <div className="space-y-3">
                <Textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  placeholder={t('describe_placeholder')}
                  className="min-h-50 resize-none"
                  autoFocus
                />
                <p className="text-muted-foreground text-xs">
                  {t('rich_text_note')}
                </p>
              </div>
            ) : editedDescription ? (
              <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/80">
                {editedDescription}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm italic">
                {t('no_description')}
              </p>
            )}
          </Card>
        </motion.div>

        {/* Project Configuration - Collapsible */}
        <ProjectConfiguration
          show={showConfiguration}
          editedStatus={editedStatus}
          setEditedStatus={setEditedStatus}
          editedPriority={editedPriority}
          setEditedPriority={setEditedPriority}
          editedHealthStatus={editedHealthStatus}
          setEditedHealthStatus={setEditedHealthStatus}
          editedLeadId={editedLeadId}
          setEditedLeadId={setEditedLeadId}
          editedStartDate={editedStartDate}
          setEditedStartDate={setEditedStartDate}
          editedEndDate={editedEndDate}
          setEditedEndDate={setEditedEndDate}
          editedArchived={editedArchived}
          setEditedArchived={setEditedArchived}
          workspaceMembers={workspaceMembers}
          isLoadingMembers={isLoadingMembers}
        />

        {/* Recent Updates */}
        <motion.div {...fadeInViewVariant(0.2)}>
          <Card className="border-2 border-dynamic-pink/20 bg-dynamic-pink/5 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="bg-linear-to-r from-dynamic-pink to-dynamic-purple bg-clip-text font-bold text-lg text-transparent">
                {t('recent_updates')}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab('updates')}
                className="gap-1 text-dynamic-pink hover:text-dynamic-pink"
              >
                {t('view_all')}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {isLoadingUpdates ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-dynamic-pink" />
              </div>
            ) : recentUpdates.length > 0 ? (
              <div className="space-y-3">
                {recentUpdates.map((update) => (
                  <div
                    key={update.id}
                    className="cursor-pointer rounded-lg border border-dynamic-pink/20 bg-background/50 p-3 transition-all hover:-translate-y-0.5 hover:border-dynamic-pink/30 hover:bg-dynamic-pink/5"
                    onClick={() => setActiveTab('updates')}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage
                          src={update.creator?.avatar_url || undefined}
                        />
                        <AvatarFallback className="text-xs">
                          {update.creator?.display_name?.[0]?.toUpperCase() ||
                            'U'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">
                        {update.creator?.display_name || t('unknown_user')}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(update.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-foreground/70 text-sm">
                      {update.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Sparkles className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">
                  {t('no_updates_yet')}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab('updates')}
                  className="mt-2 text-dynamic-pink hover:text-dynamic-pink"
                >
                  {t('post_update')}
                </Button>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Recent Tasks */}
        <motion.div {...fadeInViewVariant(0.3)}>
          <Card className="border-2 border-dynamic-blue/20 bg-dynamic-blue/5 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="bg-linear-to-r from-dynamic-blue to-dynamic-cyan bg-clip-text font-bold text-lg text-transparent">
                {t('linked_tasks')}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab('tasks')}
                className="gap-1 text-dynamic-blue hover:text-dynamic-blue"
              >
                {t('view_all')}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {recentTasks.length > 0 ? (
              <div className="space-y-2">
                {recentTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between rounded-lg border border-dynamic-blue/20 bg-background/50 p-3 transition-all hover:-translate-y-0.5 hover:border-dynamic-blue/30 hover:bg-dynamic-blue/5"
                  >
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{task.name}</h4>
                      {task.priority && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'mt-1 text-xs',
                            task.priority === 'critical'
                              ? 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red'
                              : task.priority === 'high'
                                ? 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange'
                                : task.priority === 'normal'
                                  ? 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow'
                                  : 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue'
                          )}
                        >
                          {task.priority}
                        </Badge>
                      )}
                    </div>
                    {task.closed_at && (
                      <Badge
                        variant="outline"
                        className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
                      >
                        ✓ {t('done')}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Target className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">
                  {t('no_tasks_linked')}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActiveTab('tasks');
                    setShowLinkTaskDialog(true);
                  }}
                  className="mt-2 text-dynamic-blue hover:text-dynamic-blue"
                >
                  {t('link_tasks')}
                </Button>
              </div>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Metadata sidebar */}
      <ProjectSidebar
        project={project}
        tasks={tasks}
        editedLeadId={editedLeadId}
        setEditedLeadId={setEditedLeadId}
        showLeadSelector={showLeadSelector}
        setShowLeadSelector={setShowLeadSelector}
        editedStartDate={editedStartDate}
        setEditedStartDate={setEditedStartDate}
        editedEndDate={editedEndDate}
        setEditedEndDate={setEditedEndDate}
        showTimelineEditor={showTimelineEditor}
        setShowTimelineEditor={setShowTimelineEditor}
        workspaceMembers={workspaceMembers}
        isLoadingMembers={isLoadingMembers}
        fadeInViewVariant={fadeInViewVariant}
      />
    </div>
  );
}
