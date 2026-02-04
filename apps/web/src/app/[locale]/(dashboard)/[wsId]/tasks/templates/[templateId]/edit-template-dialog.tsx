'use client';

import { Loader2, Pencil } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  FileUploader,
  type StatedFile,
} from '@tuturuuu/ui/custom/file-uploader';
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
import {
  deleteTemplateBackground,
  handleTemplateBackgroundUpload,
} from '@/utils/template-background';

interface EditTemplateDialogProps {
  wsId: string;
  templateId: string;
  templateName: string;
  templateDescription: string | null;
  templateVisibility: 'private' | 'workspace' | 'public';
  templateBackgroundUrl?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTemplateDialog({
  wsId,
  templateId,
  templateName,
  templateDescription,
  templateVisibility,
  templateBackgroundUrl,
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
  const [backgroundFiles, setBackgroundFiles] = useState<StatedFile[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(
    templateBackgroundUrl || null
  );
  const [backgroundPath, setBackgroundPath] = useState<string | null>(null);

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
      // Delete old background if a new one was uploaded
      if (backgroundPath && templateBackgroundUrl) {
        try {
          // Extract path from URL if it's a full URL
          const oldPath = templateBackgroundUrl.includes('/')
            ? templateBackgroundUrl.split('/').slice(-3).join('/')
            : templateBackgroundUrl;
          await deleteTemplateBackground(oldPath);
        } catch (error) {
          console.error('Failed to delete old background:', error);
          // Continue anyway - the update is more important
        }
      }

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/templates/${templateId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editName.trim(),
            description: editDescription.trim() || null,
            visibility: editVisibility,
            backgroundUrl: backgroundUrl,
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

  const handleBackgroundUpload = async (files: StatedFile[]) => {
    await handleTemplateBackgroundUpload(
      files,
      wsId,
      (url, path) => {
        setBackgroundUrl(url);
        setBackgroundPath(path);
      },
      (error) => {
        console.error('Background upload error:', error);
      }
    );
  };

  const handleRemoveBackground = () => {
    setBackgroundUrl(null);
    setBackgroundPath(null);
    setBackgroundFiles([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-xl">
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
          <div className="space-y-2">
            <Label>Background Image (Optional)</Label>
            <p className="text-muted-foreground text-xs">
              Upload a background image for your template. Only one image is
              allowed.
            </p>
            {backgroundUrl ? (
              <div className="space-y-2">
                <div className="relative aspect-video w-full overflow-hidden rounded-lg border">
                  {/* biome-ignore lint/performance/noImgElement: preview image */}
                  <img
                    src={backgroundUrl}
                    alt="Template background"
                    className="h-full w-full object-cover"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveBackground}
                  className="w-full"
                >
                  Remove Background
                </Button>
              </div>
            ) : (
              <FileUploader
                value={backgroundFiles}
                onValueChange={setBackgroundFiles}
                onUpload={handleBackgroundUpload}
                accept={{ 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }}
                maxSize={5 * 1024 * 1024}
                maxFileCount={1}
                multiple={false}
              />
            )}
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
