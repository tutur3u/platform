'use client';

import { Bookmark, Loader2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
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
import { useEffect, useId, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { FileUploader, type StatedFile } from '../../custom/file-uploader';

interface SaveAsTemplateDialogProps {
  board: Pick<WorkspaceTaskBoard, 'id' | 'ws_id' | 'name'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TemplateVisibility = 'private' | 'workspace' | 'public';

const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function SaveAsTemplateDialog({
  board,
  open,
  onOpenChange,
}: SaveAsTemplateDialogProps) {
  const t = useTranslations();
  const router = useRouter();
  const nameId = useId();
  const descriptionId = useId();
  const visibilityId = useId();

  const [templateName, setTemplateName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<TemplateVisibility>('private');
  const [includeTasks, setIncludeTasks] = useState(true);
  const [includeLabels, setIncludeLabels] = useState(true);
  const [includeDates, setIncludeDates] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [backgroundFiles, setBackgroundFiles] = useState<StatedFile[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);

  // Initialize template name when dialog opens
  useEffect(() => {
    if (open && board) {
      setTemplateName(board.name ?? '');
      setDescription('');
      setVisibility('private');
      setIncludeTasks(true);
      setIncludeLabels(true);
      setIncludeDates(true);
      setBackgroundFiles([]);
      setBackgroundUrl(null);
    }
  }, [open, board]);

  const handleBackgroundUpload = async (files: StatedFile[]) => {
    if (files.length === 0) {
      return;
    }

    const file = files[0]; // Only support one background image

    if (!file) {
      toast('No file selected for upload');
      return;
    }

    try {
      // Update file status to uploading
      file.status = 'uploading';

      if (!ALLOWED_IMAGE_TYPES.includes(file.rawFile.type)) {
        throw new Error(
          'Invalid file type. Only PNG, JPEG, and WebP images are allowed.'
        );
      }

      // Validate file size
      if (file.rawFile.size > MAX_FILE_SIZE) {
        throw new Error('File size exceeds 5MB limit.');
      }

      const supabase = createClient();

      // Generate unique filename
      const uniqueId = uuidv4();
      const sanitizedName = file.rawFile.name
        .toLowerCase()
        .replace(/[^a-z0-9.-]/g, '-')
        .replace(/-+/g, '-');
      const storagePath = `${board.ws_id}/template-backgrounds/${uniqueId}-${sanitizedName}`;

      // Convert File to ArrayBuffer
      const arrayBuffer = await file.rawFile.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('workspaces')
        .upload(storagePath, buffer, {
          contentType: file.rawFile.type,
          upsert: false,
        });

      if (error) {
        console.error('Error uploading template background:', error);
        throw new Error('Failed to upload background image');
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('workspaces').getPublicUrl(data.path);

      // Update file status to uploaded
      file.status = 'uploaded';
      file.finalPath = publicUrl;

      setBackgroundUrl(publicUrl);
    } catch (error) {
      file.status = 'error';
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to upload image';
      toast.error(errorMessage);
    }
  };

  const handleRemoveBackground = () => {
    setBackgroundUrl(null);
    setBackgroundFiles([]);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error(t('ws-board-templates.save_dialog.name_required'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${board.ws_id}/task-boards/${board.id}/templates`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: templateName.trim(),
            description: description.trim() || undefined,
            visibility,
            includeTasks,
            includeLabels,
            includeDates,
            backgroundUrl: backgroundUrl || undefined,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        toast.success(t('ws-board-templates.save_dialog.success'), {
          description: t('ws-board-templates.save_dialog.success_description', {
            lists: data.stats?.lists || 0,
            tasks: data.stats?.tasks || 0,
          }),
        });

        // Reset form and close dialog
        setTemplateName('');
        setDescription('');
        onOpenChange(false);

        // Refresh
        router.refresh();
      } else {
        throw new Error(data.error || 'Failed to save template');
      }
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : t('ws-board-templates.save_dialog.failed')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setTemplateName('');
    setDescription('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="h-5 w-5" />
            {t('ws-board-templates.save_dialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('ws-board-templates.save_dialog.description', {
              name: board.name ?? '',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Name */}
          <div className="space-y-2">
            <Label htmlFor={nameId}>
              {t('ws-board-templates.save_dialog.name_label')}
            </Label>
            <Input
              id={nameId}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={t('ws-board-templates.save_dialog.name_placeholder')}
              maxLength={255}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor={descriptionId}>
              {t('ws-board-templates.save_dialog.description_label')}
            </Label>
            <Textarea
              id={descriptionId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t(
                'ws-board-templates.save_dialog.description_placeholder'
              )}
              rows={2}
              maxLength={500}
            />
          </div>

          {/* Visibility */}
          <div className="space-y-2">
            <Label htmlFor={visibilityId}>
              {t('ws-board-templates.save_dialog.visibility_label')}
            </Label>
            <Select
              value={visibility}
              onValueChange={(v) => setVisibility(v as TemplateVisibility)}
            >
              <SelectTrigger id={visibilityId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">
                  {t('ws-board-templates.visibility.private')}
                </SelectItem>
                <SelectItem value="workspace">
                  {t('ws-board-templates.visibility.workspace')}
                </SelectItem>
                <SelectItem value="public">
                  {t('ws-board-templates.visibility.public')}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {visibility === 'private'
                ? t('ws-board-templates.visibility.private_hint')
                : visibility === 'workspace'
                  ? t('ws-board-templates.visibility.workspace_hint')
                  : t('ws-board-templates.visibility.public_hint')}
            </p>
          </div>

          {/* Import Options */}
          <div className="space-y-3">
            <Label>{t('ws-board-templates.save_dialog.include_label')}</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-tasks"
                  checked={includeTasks}
                  onCheckedChange={(checked) =>
                    setIncludeTasks(checked === true)
                  }
                />
                <Label
                  htmlFor="include-tasks"
                  className="cursor-pointer font-normal"
                >
                  {t('ws-board-templates.save_dialog.include_tasks')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-labels"
                  checked={includeLabels}
                  onCheckedChange={(checked) =>
                    setIncludeLabels(checked === true)
                  }
                />
                <Label
                  htmlFor="include-labels"
                  className="cursor-pointer font-normal"
                >
                  {t('ws-board-templates.save_dialog.include_labels')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-dates"
                  checked={includeDates}
                  onCheckedChange={(checked) =>
                    setIncludeDates(checked === true)
                  }
                  disabled={!includeTasks}
                />
                <Label
                  htmlFor="include-dates"
                  className={`cursor-pointer font-normal ${!includeTasks ? 'text-muted-foreground' : ''}`}
                >
                  {t('ws-board-templates.save_dialog.include_dates')}
                </Label>
              </div>
            </div>
          </div>

          {/* Background Image */}
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
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSaveTemplate}
            disabled={isLoading || !templateName.trim()}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('ws-board-templates.save_dialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
