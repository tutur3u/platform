'use client';
import { Circle } from '@tuturuuu/icons';
import { Card } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch } from '@tuturuuu/ui/switch';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { HealthStatus, TaskPriority } from '../types';
import { ProjectLeadSelector } from './project-lead-selector';
import { useProjectOverview } from './project-overview-context';

export function ProjectConfiguration() {
  const {
    showConfiguration: show,
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
    workspaceMembers,
    isLoadingMembers,
  } = useProjectOverview();

  const t = useTranslations('task_project_detail.configuration');
  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-2 border-dynamic-blue/20 bg-dynamic-blue/5 p-6 transition-all hover:border-dynamic-blue/30 hover:shadow-xl">
        <h2 className="mb-6 bg-linear-to-r from-dynamic-blue to-dynamic-cyan bg-clip-text font-bold text-lg text-transparent">
          {t('title')}
        </h2>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Status */}
          <div className="space-y-2">
            <Label className="text-foreground/70 text-sm">
              {t('status_label')}
            </Label>
            <Select
              value={editedStatus || undefined}
              onValueChange={(value) => setEditedStatus(value)}
            >
              <SelectTrigger className="border-dynamic-purple/30 bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backlog">{t('status.backlog')}</SelectItem>
                <SelectItem value="planned">{t('status.planned')}</SelectItem>
                <SelectItem value="in_progress">
                  {t('status.in_progress')}
                </SelectItem>
                <SelectItem value="in_review">
                  {t('status.in_review')}
                </SelectItem>
                <SelectItem value="in_testing">
                  {t('status.in_testing')}
                </SelectItem>
                <SelectItem value="completed">
                  {t('status.completed')}
                </SelectItem>
                <SelectItem value="cancelled">
                  {t('status.cancelled')}
                </SelectItem>
                <SelectItem value="active">{t('status.active')}</SelectItem>
                <SelectItem value="on_hold">{t('status.on_hold')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label className="text-foreground/70 text-sm">
              {t('priority_label')}
            </Label>
            <Select
              value={editedPriority || undefined}
              onValueChange={(value) =>
                setEditedPriority(value as TaskPriority)
              }
            >
              <SelectTrigger className="border-dynamic-purple/30 bg-background/50">
                <SelectValue placeholder={t('priority_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-dynamic-red" />
                    {t('priority.critical')}
                  </span>
                </SelectItem>
                <SelectItem value="high">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-dynamic-orange" />
                    {t('priority.high')}
                  </span>
                </SelectItem>
                <SelectItem value="normal">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-dynamic-yellow" />
                    {t('priority.normal')}
                  </span>
                </SelectItem>
                <SelectItem value="low">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-dynamic-blue" />
                    {t('priority.low')}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Health Status */}
          <div className="space-y-2">
            <Label className="text-foreground/70 text-sm">
              {t('health_status_label')}
            </Label>
            <Select
              value={editedHealthStatus || undefined}
              onValueChange={(value) =>
                setEditedHealthStatus(value as HealthStatus)
              }
            >
              <SelectTrigger className="border-dynamic-purple/30 bg-background/50">
                <SelectValue placeholder={t('health_status_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on_track">
                  <span className="flex items-center gap-2">
                    <Circle className="h-2 w-2 rounded-full text-dynamic-green" />
                    {t('health_status.on_track')}
                  </span>
                </SelectItem>
                <SelectItem value="at_risk">
                  <span className="flex items-center gap-2">
                    <Circle className="h-2 w-2 rounded-full text-dynamic-yellow" />
                    {t('health_status.at_risk')}
                  </span>
                </SelectItem>
                <SelectItem value="off_track">
                  <span className="flex items-center gap-2">
                    <Circle className="h-2 w-2 rounded-full text-dynamic-red" />
                    {t('health_status.off_track')}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Project Lead */}
          <div className="space-y-2">
            <Label className="text-foreground/70 text-sm">
              {t('project_lead_label')}
            </Label>
            <ProjectLeadSelector
              leadId={editedLeadId}
              workspaceMembers={workspaceMembers}
              isLoading={isLoadingMembers}
              onChange={setEditedLeadId}
            />
          </div>

          {/* Start Date */}
          <div className="space-y-2">
            <Label className="text-foreground/70 text-sm">
              {t('start_date_label')}
            </Label>
            <Input
              type="date"
              value={editedStartDate}
              onChange={(e) => setEditedStartDate(e.target.value)}
              className="border-dynamic-purple/30 bg-background/50"
            />
          </div>

          {/* End Date */}
          <div className="space-y-2">
            <Label className="text-foreground/70 text-sm">
              {t('end_date_label')}
            </Label>
            <Input
              type="date"
              value={editedEndDate}
              onChange={(e) => setEditedEndDate(e.target.value)}
              className="border-dynamic-purple/30 bg-background/50"
            />
          </div>

          {/* Archived */}
          <div className="flex items-center justify-between rounded-lg border border-dynamic-purple/30 bg-background/50 p-3">
            <div className="space-y-0.5">
              <Label className="text-foreground/70 text-sm">
                {t('archive_project')}
              </Label>
              <p className="text-muted-foreground text-xs">
                {t('archive_description')}
              </p>
            </div>
            <Switch
              checked={editedArchived}
              onCheckedChange={setEditedArchived}
            />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
