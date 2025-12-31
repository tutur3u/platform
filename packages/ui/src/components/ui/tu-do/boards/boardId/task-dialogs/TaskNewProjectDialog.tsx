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
import { useTranslations } from 'next-intl';

interface TaskNewProjectDialogProps {
  open: boolean;
  newProjectName: string;
  creatingProject: boolean;
  onOpenChange: (open: boolean) => void;
  onNameChange: (name: string) => void;
  onConfirm: () => void;
}

export function TaskNewProjectDialog({
  open,
  newProjectName,
  creatingProject,
  onOpenChange,
  onNameChange,
  onConfirm,
}: TaskNewProjectDialogProps) {
  const t = useTranslations('common');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('create_new_project')}</DialogTitle>
          <DialogDescription>
            {t('create_new_project_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>{t('project_name')}</Label>
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
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={!newProjectName.trim() || creatingProject}
          >
            {creatingProject ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
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
