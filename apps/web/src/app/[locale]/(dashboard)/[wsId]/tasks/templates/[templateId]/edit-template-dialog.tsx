'use client';

import { Loader2, Pencil } from '@tuturuuu/icons';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

interface EditTemplateDialogProps {
  wsId: string;
  templateId: string;
  templateName: string;
  templateDescription: string | null;
  templateVisibility: 'private' | 'workspace' | 'public';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTemplateDialog({
  wsId,
  templateId,
  templateName,
  templateDescription,
  templateVisibility,
  open,
  onOpenChange,
}: EditTemplateDialogProps) {
  const t = useTranslations('ws-board-templates');
  const router = useRouter();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(templateName);
  const [editDescription, setEditDescription] = useState(
    templateDescription || ''
  );
  const [editVisibility, setEditVisibility] = useState(templateVisibility);

  const nameId = useId();
  const descId = useId();
  const visibilityId = useId();

  const handleEdit = async () => {
    if (!editName.trim()) {
      toast.error(t('detail.name_required'));
      return;
    }

    setIsEditing(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/templates/${templateId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editName.trim(),
            description: editDescription.trim() || null,
            visibility: editVisibility,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update template');
      }

      toast.success(t('detail.update_success'));
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      console.error('Error updating template:', error);
      toast.error(
        error instanceof Error ? error.message : t('detail.update_error')
      );
    } finally {
      setIsEditing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            {t('detail.edit_title')}
          </DialogTitle>
          <DialogDescription>{t('detail.edit_description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={nameId}>{t('save_dialog.name_label')}</Label>
            <Input
              id={nameId}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={t('save_dialog.name_placeholder')}
              maxLength={255}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={descId}>{t('save_dialog.description_label')}</Label>
            <Textarea
              id={descId}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder={t('save_dialog.description_placeholder')}
              rows={2}
              maxLength={500}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={visibilityId}>
              {t('save_dialog.visibility_label')}
            </Label>
            <Select
              value={editVisibility}
              onValueChange={(v) =>
                setEditVisibility(v as 'private' | 'workspace' | 'public')
              }
            >
              <SelectTrigger id={visibilityId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">
                  {t('visibility.private')}
                </SelectItem>
                <SelectItem value="workspace">
                  {t('visibility.workspace')}
                </SelectItem>
                <SelectItem value="public">{t('visibility.public')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {editVisibility === 'private'
                ? t('visibility.private_hint')
                : t('visibility.workspace_hint')}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isEditing}
          >
            {t('common.cancel')}
          </Button>
          <Button onClick={handleEdit} disabled={isEditing || !editName.trim()}>
            {isEditing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save_changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
