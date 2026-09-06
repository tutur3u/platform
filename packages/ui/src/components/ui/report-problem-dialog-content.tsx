'use client';

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  MessageSquareWarning,
  Upload,
  X,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn, isValidBlobUrl } from '@tuturuuu/utils/format';
import {
  ALLOWED_VIDEO_TYPES,
  DEFAULT_PRODUCTS,
  DEFAULT_SUPPORT_TYPES,
  MAX_FILES,
  type ReportProblemDialogProps,
} from './report-problem-model';
import { useReportProblem } from './use-report-problem';
export function ReportProblemDialogContent({
  ImageComponent,
  products = DEFAULT_PRODUCTS,
  className,
  trigger,
  showTrigger = true,
  ...props
}: ReportProblemDialogProps) {
  const { t } = props;
  const PreviewImage = ImageComponent ?? 'img';
  const {
    dialogOpen,
    handleOpenChange,
    handleSubmit,
    formData,
    validationErrors,
    isSubmitting,
    isCompressing,
    suggestionId,
    mediaUploadId,
    isDragOver,
    fileInputRef,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleProductChange,
    handleTypeChange,
    handleSuggestionChange,
    handleMediaUpload,
    mediaPreviews,
    removeMedia,
  } = useReportProblem(props);
  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      {showTrigger && (
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="secondary" size="sm" className={cn(className)}>
              <MessageSquareWarning className="mr-2 h-4 w-4" />
              {t('report-problem')}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="mx-auto flex max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-7xl flex-col overflow-hidden">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900">
              <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            {t('report-problem')}
          </DialogTitle>
          <DialogDescription className="mt-2 text-muted-foreground text-sm">
            {t('report-problem-description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
              <Label
                htmlFor="product"
                className="flex items-center gap-1 font-medium text-sm"
              >
                {t('affected-product-required')}
              </Label>
              <Select
                value={formData.product}
                onValueChange={handleProductChange}
              >
                <SelectTrigger
                  className={cn(
                    'h-11',
                    validationErrors.product &&
                      'border-red-500 focus:border-red-500'
                  )}
                >
                  <SelectValue placeholder={t('select-product-placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.value} value={product.value}>
                      {product.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.product && (
                <div className="flex items-center gap-1 text-red-600 text-sm">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.product}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label
                htmlFor="type"
                className="flex items-center gap-1 font-medium text-sm"
              >
                Support Type *
              </Label>
              <Select value={formData.type} onValueChange={handleTypeChange}>
                <SelectTrigger
                  className={cn(
                    'h-11',
                    validationErrors.type &&
                      'border-red-500 focus:border-red-500'
                  )}
                >
                  <SelectValue placeholder="Select support type..." />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_SUPPORT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.type && (
                <div className="flex items-center gap-1 text-red-600 text-sm">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.type}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label
                htmlFor="suggestion"
                className="flex items-center gap-1 font-medium text-sm"
              >
                {t('suggestion-improve')}
              </Label>
              <Textarea
                id={suggestionId}
                placeholder={t('suggestion-placeholder')}
                value={formData.suggestion}
                onChange={handleSuggestionChange}
                className={cn(
                  'max-h-62.5 min-h-30 resize-y',
                  validationErrors.suggestion &&
                    'border-red-500 focus:border-red-500'
                )}
              />
              {validationErrors.suggestion && (
                <div className="flex items-center gap-1 text-red-600 text-sm">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.suggestion}
                </div>
              )}
              <div className="text-muted-foreground text-xs">
                {formData.suggestion.length}/1000 characters
              </div>
            </div>

            <div className="space-y-4">
              <Label className="font-medium text-sm">
                {t('media-optional')} ({formData.media.length}/{MAX_FILES})
              </Label>

              {formData.media.length < MAX_FILES && (
                <button
                  type="button"
                  className={cn(
                    'relative mt-2 w-full rounded-lg border-2 border-dashed transition-all duration-200',
                    isDragOver
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
                      : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500',
                    isCompressing && 'pointer-events-none opacity-50'
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  aria-label="Click to upload or drag and drop media files"
                  disabled={isCompressing}
                >
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                    multiple
                    onChange={handleMediaUpload}
                    disabled={isSubmitting || isCompressing}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    id={mediaUploadId}
                  />
                  <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                    <div
                      className={cn(
                        'mb-3 flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                        isDragOver
                          ? 'bg-orange-100 dark:bg-orange-900'
                          : 'bg-gray-100 dark:bg-gray-800'
                      )}
                    >
                      <Upload
                        className={cn(
                          'h-5 w-5',
                          isDragOver ? 'text-orange-600' : 'text-gray-400'
                        )}
                      />
                    </div>
                    <p className="mb-1 font-medium text-sm">
                      {isCompressing
                        ? 'Compressing...'
                        : isDragOver
                          ? 'Drop files here'
                          : 'Click to upload or drag and drop'}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Images (PNG, JPG, GIF, WebP) or Videos (MP4, WebM, MOV) up
                      to 5MB each
                    </p>
                  </div>
                </button>
              )}

              {validationErrors.media && (
                <div className="text-red-600 text-sm">
                  {validationErrors.media}
                </div>
              )}

              {mediaPreviews.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {mediaPreviews.map((preview, index) => {
                    const file = formData.media[index];
                    const isVideo =
                      file && ALLOWED_VIDEO_TYPES.includes(file.type);

                    return (
                      <div key={preview} className="group relative">
                        <div className="aspect-square overflow-hidden rounded-lg border-2 border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                          {isVideo ? (
                            <video
                              src={isValidBlobUrl(preview) ? preview : ''}
                              className="h-full w-full object-cover"
                              controls={false}
                              muted
                              playsInline
                            />
                          ) : (
                            <PreviewImage
                              src={
                                isValidBlobUrl(preview)
                                  ? preview
                                  : '/placeholder.svg'
                              }
                              alt={t('media-alt', { number: index + 1 })}
                              className="h-full w-full object-cover"
                              width={100}
                              height={100}
                            />
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                          onClick={() => removeMedia(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex w-full flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={
                  !formData.product ||
                  !formData.type ||
                  !formData.suggestion.trim() ||
                  isSubmitting
                }
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 sm:w-auto"
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {t('submitting')}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    {t('submit-report')}
                  </div>
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
