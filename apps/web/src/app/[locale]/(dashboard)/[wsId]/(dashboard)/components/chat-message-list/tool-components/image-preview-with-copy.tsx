import { Check, ClipboardCopy } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';

type ImagePreviewWithCopyProps = {
  imageUrl: string;
  alt: string;
  copiedImageUrl: string | null;
  onCopy: (imageUrl: string) => void | Promise<void>;
  onFullscreen: (imageUrl: string) => void;
  copyLabel: string;
  copiedLabel: string;
  className?: string;
};

export function ImagePreviewWithCopy({
  imageUrl,
  alt,
  copiedImageUrl,
  onCopy,
  onFullscreen,
  copyLabel,
  copiedLabel,
  className,
}: ImagePreviewWithCopyProps) {
  const isCopied = copiedImageUrl === imageUrl;
  const buttonLabel = isCopied ? copiedLabel : copyLabel;

  return (
    <div className="group/image relative w-fit">
      <button
        type="button"
        onClick={() => onFullscreen(imageUrl)}
        className="w-fit overflow-hidden rounded-lg border border-border/50 text-left transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-dynamic-blue focus:ring-offset-2"
      >
        {/* biome-ignore lint/performance/noImgElement: Dynamic URL from tool output */}
        <img
          src={imageUrl}
          alt={alt}
          className={cn('max-h-80 w-auto cursor-pointer', className)}
          loading="lazy"
        />
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void onCopy(imageUrl);
        }}
        className="absolute top-2 right-2 rounded-md border border-white/20 bg-black/60 p-1 text-white opacity-0 backdrop-blur-sm transition hover:bg-black/75 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/60 group-hover/image:opacity-100"
        title={buttonLabel}
        aria-label={buttonLabel}
      >
        {isCopied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <ClipboardCopy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
