'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Loader2 } from '@tuturuuu/icons';
import type { TaskProject } from '../types';

interface EditProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: TaskProject | null;
  onSubmit: (data: { name: string; description?: string }) => void;
  isUpdating: boolean;
}

export function EditProjectDialog({
  open,
  onOpenChange,
  project,
  onSubmit,
  isUpdating,
}: EditProjectDialogProps) {
  const t = useTranslations('task-projects.edit_dialog');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description || '');
    }
  }, [project]);

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return; // Prevent empty names

    onSubmit({
      name: trimmedName,
      description: description.trim() || undefined,
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !isUpdating) {
      setName('');
      setDescription('');
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-project-name" className="font-medium text-sm">
              {t('project_name')}
            </Label>
            <Input
              id="edit-project-name"
              placeholder={t('project_name_placeholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isUpdating}
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="edit-project-description"
              className="font-medium text-sm"
            >
              {t('description_label')}
            </Label>
            <Textarea
              id="edit-project-description"
              placeholder={t('description_placeholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isUpdating}
              className="min-h-20"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={isUpdating}
          >
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isUpdating || !name.trim()}>
            {isUpdating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('updating')}
              </>
            ) : (
              t('update_project')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
