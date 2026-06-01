'use client';

import { Check, Edit2, Loader2, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
  HealthStatusBadge,
  StatusBadge,
} from '../../components/project-badges';
import type { HealthStatus } from '../types';

interface ProjectHeaderProps {
  projectName: string;
  editedName: string;
  setEditedName: (value: string) => void;
  isEditingName: boolean;
  setIsEditingName: (value: boolean) => void;
  editedStatus: string | null;
  editedHealthStatus: HealthStatus | null;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
  fadeInUpVariant: (delay?: number) => object;
}

export function ProjectHeader({
  projectName,
  editedName,
  setEditedName,
  isEditingName,
  setIsEditingName,
  editedStatus,
  editedHealthStatus,
  hasUnsavedChanges,
  isSaving,
  onSave,
  onCancel,
  fadeInUpVariant,
}: ProjectHeaderProps) {
  const t = useTranslations('task_project_detail.header');
  return (
    <motion.div
      {...fadeInUpVariant(0)}
      className="relative rounded-lg border bg-card p-3 shadow-sm"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="h-10 font-semibold text-xl"
                placeholder={t('project_name_placeholder')}
                autoFocus
              />
            </div>
          ) : (
            <div className="group flex items-center gap-2">
              <h1 className="truncate font-semibold text-xl">{projectName}</h1>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => setIsEditingName(true)}
                aria-label={t('edit_name_aria')}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={editedStatus} />
            <HealthStatusBadge health={editedHealthStatus} />
          </div>
        </div>

        {hasUnsavedChanges && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-wrap items-center gap-2"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isSaving}
            >
              <X className="mr-2 h-4 w-4" />
              {t('cancel')}
            </Button>
            <Button size="sm" onClick={onSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('saving')}
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  {t('save_changes')}
                </>
              )}
            </Button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
