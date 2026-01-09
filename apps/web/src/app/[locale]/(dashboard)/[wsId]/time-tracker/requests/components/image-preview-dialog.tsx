'use client';
import { ChevronLeftIcon, ChevronRightIcon } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';

interface ImagePreviewDialogProps {
  isOpen: boolean;
  selectedImageIndex: number | null;
  imageUrls: string[];
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function ImagePreviewDialog({
  isOpen,
  selectedImageIndex,
  imageUrls,
  onClose,
  onNavigate,
}: ImagePreviewDialogProps) {
  const t = useTranslations('time-tracker.requests');

  if (selectedImageIndex === null) return null;

  const handlePrevious = () => {
    const current = selectedImageIndex;
    if (current === 0) {
      onNavigate(imageUrls.length - 1);
    } else {
      onNavigate(current - 1);
    }
  };

  const handleNext = () => {
    const current = selectedImageIndex;
    if (current === imageUrls.length - 1) {
      onNavigate(0);
    } else {
      onNavigate(current + 1);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[95vh] flex-col sm:max-w-7xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>
              {t('detail.imageNavigation', {
                current: selectedImageIndex + 1,
                total: imageUrls.length,
              })}
            </DialogTitle>
          </div>
        </DialogHeader>

        {imageUrls[selectedImageIndex] && (
          <div className="flex flex-1 flex-col space-y-4 overflow-hidden">
            <div className="flex flex-1 items-center justify-center overflow-hidden rounded-lg bg-muted/10">
              {/* biome-ignore lint/performance/noImgElement: Dynamic blob URL from Supabase storage */}
              <img
                src={imageUrls[selectedImageIndex]}
                alt={`Full view - Attachment ${selectedImageIndex + 1}`}
                className="h-full max-h-[80vh] w-full object-contain"
              />
            </div>

            {imageUrls.length > 1 && (
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevious}
                  className="flex-1"
                >
                  <ChevronLeftIcon className="mr-2 h-4 w-4" />
                  {t('detail.previousImage')}
                </Button>

                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  {Array.from({ length: imageUrls.length }).map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onNavigate(idx)}
                      className={`h-2 w-2 rounded-full transition-all ${
                        idx === selectedImageIndex
                          ? 'w-4 bg-dynamic-blue'
                          : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                      }`}
                    />
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  className="flex-1"
                >
                  {t('detail.nextImage')}
                  <ChevronRightIcon className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
