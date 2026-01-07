'use client';

import { Loader2 } from '@tuturuuu/icons';
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
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; description?: string }) => void;
  isCreating: boolean;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onSubmit,
  isCreating,
}: CreateProjectDialogProps) {
  const t = useTranslations('task-projects.create_dialog');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return; // Prevent empty names

    onSubmit({
      name: trimmedName,
      description: description.trim() || undefined,
    });
    setName('');
    setDescription('');
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !isCreating) {
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
            <Label htmlFor="project-name" className="font-medium text-sm">
              {t('project_name')}
            </Label>
            <Input
              id="project-name"
              placeholder={t('project_name_placeholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isCreating}
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="project-description"
              className="font-medium text-sm"
            >
              {t('description_label')}
            </Label>
            <Textarea
              id="project-description"
              placeholder={t('description_placeholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isCreating}
              className="min-h-20"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={isCreating}
          >
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isCreating || !name.trim()}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('creating')}
              </>
            ) : (
              t('create_project')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
