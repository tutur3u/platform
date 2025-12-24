import { ClockIcon, Loader2 } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { ImageUploadSection } from './image-upload-section';
import { calculateDuration as calculateDurationUtil } from '../utils';
import type { UseImageUploadReturn } from '../hooks/use-image-upload';

interface RequestEditFormProps {
  editTitle: string;
  setEditTitle: (value: string) => void;
  editDescription: string;
  setEditDescription: (value: string) => void;
  editStartTime: string;
  setEditStartTime: (value: string) => void;
  editEndTime: string;
  setEditEndTime: (value: string) => void;
  imageUpload: UseImageUploadReturn;
  existingImageUrlsForDisplay: string[];
  isUpdating: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function RequestEditForm({
  editTitle,
  setEditTitle,
  editDescription,
  setEditDescription,
  editStartTime,
  setEditStartTime,
  editEndTime,
  setEditEndTime,
  imageUpload,
  existingImageUrlsForDisplay,
  isUpdating,
  onSave,
  onCancel,
}: RequestEditFormProps) {
  const t = useTranslations('time-tracker.requests');
  const tTracker = useTranslations('time-tracker');

  return (
    <div className="space-y-4 rounded-lg border border-dynamic-blue/30 bg-dynamic-blue/5 p-4">
      <div className="space-y-2">
        <Label htmlFor="edit-title">{t('detail.titleLabel')}</Label>
        <Input
          id="edit-title"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder={t('detail.titleLabel')}
          disabled={isUpdating}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-description">{t('detail.descriptionLabel')}</Label>
        <Textarea
          id="edit-description"
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          placeholder={t('detail.descriptionLabel')}
          rows={3}
          disabled={isUpdating}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit-start-time">{t('detail.startTime')}</Label>
          <Input
            id="edit-start-time"
            type="datetime-local"
            value={editStartTime}
            onChange={(e) => setEditStartTime(e.target.value)}
            disabled={isUpdating}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-end-time">{t('detail.endTime')}</Label>
          <Input
            id="edit-end-time"
            type="datetime-local"
            value={editEndTime}
            onChange={(e) => setEditEndTime(e.target.value)}
            disabled={isUpdating}
          />
        </div>

        <div className="flex items-center gap-4 md:col-span-2">
          <div className="h-px flex-1 bg-linear-to-r from-transparent via-border to-transparent" />
          <Badge
            variant="outline"
            className="border-dynamic-blue/30 bg-dynamic-blue/5 px-3 py-1 font-semibold text-dynamic-blue"
          >
            <ClockIcon className="mr-1.5 h-3.5 w-3.5" />
            {calculateDurationUtil(editStartTime, editEndTime)}
          </Badge>
          <div className="h-px flex-1 bg-linear-to-r from-transparent via-border to-transparent" />
        </div>
      </div>

      {/* Image Upload Section */}
      <ImageUploadSection
        images={imageUpload.images}
        imagePreviews={imageUpload.imagePreviews}
        existingImageUrls={existingImageUrlsForDisplay}
        isCompressing={imageUpload.isCompressing}
        isDragOver={imageUpload.isDragOver}
        imageError={imageUpload.imageError}
        disabled={isUpdating}
        canAddMore={imageUpload.canAddMoreImages}
        fileInputRef={imageUpload.fileInputRef}
        onDragOver={imageUpload.handleDragOver}
        onDragLeave={imageUpload.handleDragLeave}
        onDrop={imageUpload.handleDrop}
        onFileChange={imageUpload.handleImageUpload}
        onRemoveNew={imageUpload.removeImage}
        onRemoveExisting={imageUpload.removeExistingImage}
        labels={{
          proofOfWork: t('detail.addMoreImages', {
            current: imageUpload.totalImageCount,
            max: 5,
          }),
          compressing: tTracker('missed_entry_dialog.approval.compressing'),
          dropImages: tTracker('missed_entry_dialog.approval.dropImages'),
          clickToUpload: tTracker('missed_entry_dialog.approval.clickToUpload'),
          imageFormats: tTracker('missed_entry_dialog.approval.imageFormats'),
          proofImageAlt: tTracker('missed_entry_dialog.approval.proofImageAlt'),
          existing: t('detail.existingImage'),
          new: t('detail.newImage'),
        }}
      />

      {/* Save/Cancel Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={onSave}
          disabled={isUpdating || !editTitle.trim()}
          className="flex-1"
        >
          {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('detail.saveButton')}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={isUpdating}>
          {t('detail.cancelEditButton')}
        </Button>
      </div>
    </div>
  );
}
