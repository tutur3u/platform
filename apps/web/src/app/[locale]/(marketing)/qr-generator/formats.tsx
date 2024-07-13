import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

function QRFormats({
  format,
  setFormat,
}: {
  format: 'png' | 'jpg' | 'webp';
  setFormat: (format: 'png' | 'jpg' | 'webp') => void;
}) {
  const t = useTranslations();

  return (
    <>
      <div className="mb-2 mt-4 font-semibold">{t('common.formats')}</div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <button
          className={cn(
            'hover:border-foreground flex items-center justify-center rounded-lg border-2 p-4 text-center transition',
            format === 'png' && 'border-foreground bg-foreground/5'
          )}
          onClick={() => setFormat('png')}
        >
          .png
        </button>
        <button
          className={cn(
            'hover:border-foreground flex items-center justify-center rounded-lg border-2 p-4 text-center transition',
            format === 'jpg' && 'border-foreground bg-foreground/5'
          )}
          onClick={() => setFormat('jpg')}
        >
          .jpg
        </button>
        <button
          className={cn(
            'hover:border-foreground flex items-center justify-center rounded-lg border-2 p-4 text-center transition',
            format === 'webp' && 'border-foreground bg-foreground/5'
          )}
          onClick={() => setFormat('webp')}
        >
          .webp
        </button>
      </div>
    </>
  );
}

export default QRFormats;
