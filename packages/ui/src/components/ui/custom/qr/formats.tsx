import { cn } from '@tuturuuu/utils/format';
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
      <div className="mt-4 mb-2 font-semibold">{t('common.formats')}</div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <button
          type="button"
          className={cn(
            'flex items-center justify-center rounded-lg border-2 p-4 text-center transition hover:border-foreground',
            format === 'png' && 'border-foreground bg-foreground/5'
          )}
          onClick={() => setFormat('png')}
        >
          .png
        </button>
        <button
          type="button"
          className={cn(
            'flex items-center justify-center rounded-lg border-2 p-4 text-center transition hover:border-foreground',
            format === 'jpg' && 'border-foreground bg-foreground/5'
          )}
          onClick={() => setFormat('jpg')}
        >
          .jpg
        </button>
        <button
          type="button"
          className={cn(
            'flex items-center justify-center rounded-lg border-2 p-4 text-center transition hover:border-foreground',
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
