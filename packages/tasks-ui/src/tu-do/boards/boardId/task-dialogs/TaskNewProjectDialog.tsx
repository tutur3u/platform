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

// Default translations for when component is rendered outside NextIntlClientProvider
const defaultTranslations = {
  create_new_project: 'Create New Project',
  create_new_project_description:
    'Create a new project to organize related tasks across boards.',
  project_name: 'Project Name',
  cancel: 'Cancel',
  creating: 'Creating...',
  create_project: 'Create Project',
};

interface TaskNewProjectDialogProps {
  open: boolean;
  newProjectName: string;
  creatingProject: boolean;
  onOpenChange: (open: boolean) => void;
  onNameChange: (name: string) => void;
  onConfirm: () => void;
  /** Optional translations override for use in isolated React roots */
  translations?: {
    create_new_project?: string;
    create_new_project_description?: string;
    project_name?: string;
    cancel?: string;
    creating?: string;
    create_project?: string;
  };
}

export function TaskNewProjectDialog({
  open,
  newProjectName,
  creatingProject,
  onOpenChange,
  onNameChange,
  onConfirm,
  translations,
}: TaskNewProjectDialogProps) {
  // Use provided translations or defaults
  const t = {
    create_new_project:
      translations?.create_new_project ??
      defaultTranslations.create_new_project,
    create_new_project_description:
      translations?.create_new_project_description ??
      defaultTranslations.create_new_project_description,
    project_name:
      translations?.project_name ?? defaultTranslations.project_name,
    cancel: translations?.cancel ?? defaultTranslations.cancel,
    creating: translations?.creating ?? defaultTranslations.creating,
    create_project:
      translations?.create_project ?? defaultTranslations.create_project,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t.create_new_project}</DialogTitle>
          <DialogDescription>
            {t.create_new_project_description}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>{t.project_name}</Label>
            <Input
              value={newProjectName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g., Website Redesign, Q4 Campaign"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newProjectName.trim()) {
                  if (creatingProject) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  onConfirm();
                }
              }}
              disabled={creatingProject}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creatingProject}
          >
            {t.cancel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={!newProjectName.trim() || creatingProject}
          >
            {creatingProject ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.creating}
              </>
            ) : (
              t.create_project
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
