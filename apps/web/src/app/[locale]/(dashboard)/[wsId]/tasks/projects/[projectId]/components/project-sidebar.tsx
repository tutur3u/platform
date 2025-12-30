'use client';

import { Calendar, Edit2, Target, User } from '@tuturuuu/icons';
import type { TaskProjectWithRelations } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import type { WorkspaceMember } from '@tuturuuu/ui/hooks/use-workspace-members';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { ProjectLeadSelector } from './project-lead-selector';

interface ProjectSidebarProps {
  project: TaskProjectWithRelations;
  tasks: Task[];
  editedLeadId: string | null;
  setEditedLeadId: (value: string | null) => void;
  showLeadSelector: boolean;
  setShowLeadSelector: (value: boolean) => void;
  editedStartDate: string;
  setEditedStartDate: (value: string) => void;
  editedEndDate: string;
  setEditedEndDate: (value: string) => void;
  showTimelineEditor: boolean;
  setShowTimelineEditor: (value: boolean) => void;
  workspaceMembers: WorkspaceMember[];
  isLoadingMembers: boolean;
  fadeInViewVariant: (delay?: number) => object;
}

export function ProjectSidebar({
  project,
  tasks,
  editedLeadId,
  setEditedLeadId,
  showLeadSelector,
  setShowLeadSelector,
  editedStartDate,
  setEditedStartDate,
  editedEndDate,
  setEditedEndDate,
  showTimelineEditor,
  setShowTimelineEditor,
  workspaceMembers,
  isLoadingMembers,
  fadeInViewVariant,
}: ProjectSidebarProps) {
  const t = useTranslations('task_project_detail.sidebar');
  return (
    <div className="space-y-4">
      {/* Project Lead */}
      <motion.div {...fadeInViewVariant(0.2)}>
        <Card className="group border-2 border-dynamic-pink/20 bg-dynamic-pink/5 p-4 transition-all hover:border-dynamic-pink/30 hover:shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-dynamic-pink to-dynamic-red">
                <User className="h-4 w-4 text-white" />
              </div>
              <h3 className="font-semibold text-sm">{t('project_lead')}</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => setShowLeadSelector(!showLeadSelector)}
              aria-label={t('edit_lead_aria')}
            >
              <Edit2 className="h-3 w-3" />
            </Button>
          </div>

          {showLeadSelector ? (
            <div className="space-y-2">
              <Label className="text-foreground/70 text-xs">
                {t('select_lead_label')}
              </Label>
              <ProjectLeadSelector
                leadId={editedLeadId}
                workspaceMembers={workspaceMembers}
                isLoading={isLoadingMembers}
                onChange={(value) => {
                  setEditedLeadId(value);
                  setShowLeadSelector(false);
                }}
                compact
              />
            </div>
          ) : editedLeadId ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src={
                    workspaceMembers.find((m) => m.id === editedLeadId)
                      ?.avatar_url ||
                    project.lead?.avatar_url ||
                    undefined
                  }
                />
                <AvatarFallback className="bg-linear-to-br from-dynamic-pink to-dynamic-purple text-white text-xs">
                  {(workspaceMembers.find((m) => m.id === editedLeadId)
                    ?.display_name ||
                    project.lead?.display_name ||
                    'U')?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">
                {workspaceMembers.find((m) => m.id === editedLeadId)
                  ?.display_name ||
                  project.lead?.display_name ||
                  t('unknown')}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowLeadSelector(true)}
              className="w-full rounded-lg border border-dynamic-pink/30 border-dashed p-3 text-center text-muted-foreground text-sm italic transition-colors hover:border-dynamic-pink/50 hover:bg-dynamic-pink/5"
            >
              {t('click_assign_lead')}
            </button>
          )}
        </Card>
      </motion.div>

      {/* Timeline */}
      <motion.div {...fadeInViewVariant(0.3)}>
        <Card className="group border-2 border-dynamic-green/20 bg-dynamic-green/5 p-4 transition-all hover:border-dynamic-green/30 hover:shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-dynamic-green to-dynamic-cyan">
                <Calendar className="h-4 w-4 text-white" />
              </div>
              <h3 className="font-semibold text-sm">{t('timeline')}</h3>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => setShowTimelineEditor(!showTimelineEditor)}
              aria-label={t('edit_timeline_aria')}
            >
              <Edit2 className="h-3 w-3" />
            </Button>
          </div>

          {showTimelineEditor ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-foreground/70 text-xs">
                  {t('start_date')}
                </Label>
                <Input
                  type="date"
                  value={editedStartDate}
                  onChange={(e) => setEditedStartDate(e.target.value)}
                  className="h-9 border-dynamic-green/30 bg-background/50 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground/70 text-xs">
                  {t('end_date')}
                </Label>
                <Input
                  type="date"
                  value={editedEndDate}
                  onChange={(e) => setEditedEndDate(e.target.value)}
                  className="h-9 border-dynamic-green/30 bg-background/50 text-sm"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              {editedStartDate && (
                <div className="flex justify-between">
                  <span className="text-foreground/60">{t('start_label')}</span>
                  <span className="font-medium">
                    {new Date(editedStartDate).toLocaleDateString()}
                  </span>
                </div>
              )}
              {editedEndDate && (
                <div className="flex justify-between">
                  <span className="text-foreground/60">{t('end_label')}</span>
                  <span className="font-medium">
                    {new Date(editedEndDate).toLocaleDateString()}
                  </span>
                </div>
              )}
              {!editedStartDate && !editedEndDate && (
                <button
                  type="button"
                  onClick={() => setShowTimelineEditor(true)}
                  className="w-full rounded-lg border border-dynamic-green/30 border-dashed p-3 text-center text-muted-foreground text-sm italic transition-colors hover:border-dynamic-green/50 hover:bg-dynamic-green/5"
                >
                  {t('click_set_timeline')}
                </button>
              )}
            </div>
          )}
        </Card>
      </motion.div>

      {/* Stats */}
      <motion.div {...fadeInViewVariant(0.4)}>
        <Card className="group border-2 border-dynamic-blue/20 bg-dynamic-blue/5 p-4 transition-all hover:border-dynamic-blue/30 hover:shadow-lg">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-dynamic-blue to-dynamic-purple">
              <Target className="h-4 w-4 text-white" />
            </div>
            <h3 className="font-semibold text-sm">{t('project_stats')}</h3>
          </div>
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-foreground/60">{t('total_tasks')}</span>
                <span className="font-bold text-lg">{tasks.length}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-dynamic-blue/10">
                <div className="h-full rounded-full bg-linear-to-r from-dynamic-blue to-dynamic-cyan" />
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-foreground/60">{t('completed')}</span>
                <span className="font-bold text-lg">
                  {tasks.filter((t) => t.closed_at).length}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-dynamic-green/10">
                <div
                  className="h-full rounded-full bg-linear-to-r from-dynamic-green to-dynamic-cyan"
                  style={{
                    width: `${tasks.length > 0 ? (tasks.filter((t) => t.closed_at).length / tasks.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-foreground/60">{t('in_progress')}</span>
                <span className="font-bold text-lg">
                  {tasks.filter((t) => !t.closed_at).length}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-dynamic-orange/10">
                <div
                  className="h-full rounded-full bg-linear-to-r from-dynamic-orange to-dynamic-red"
                  style={{
                    width: `${tasks.length > 0 ? (tasks.filter((t) => !t.closed_at).length / tasks.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
