'use client';

import { Download } from '@tuturuuu/icons';
import { Dialog, DialogContent, DialogTitle } from '@tuturuuu/ui/dialog';
import { cn } from '@tuturuuu/utils/format';

export function FormsImageDialog({
  open,
  onOpenChange,
  src,
  alt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  alt: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-[90vw] items-center justify-center border-none bg-transparent p-0 shadow-none sm:max-w-[90vw]">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <div className="relative flex items-center justify-center">
          {/* biome-ignore lint/performance/noImgElement: signed URLs are not compatible with Next.js image optimization */}
          <img
            src={src}
            alt={alt}
            className="max-h-[85vh] max-w-[88vw] rounded-lg object-contain shadow-2xl"
          />
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            download={alt}
            className={cn(
              'absolute right-2 bottom-2 flex h-8 w-8 items-center justify-center rounded-full',
              'border border-border/60 bg-background/85 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background'
            )}
            aria-label={alt}
          >
            <Download className="h-4 w-4" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
