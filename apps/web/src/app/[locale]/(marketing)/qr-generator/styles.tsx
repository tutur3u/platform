import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { X } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { QRCodeCanvas } from 'qrcode.react';

function QRStyles({
  style,
  setStyle,
}: {
  style: 'default' | 'brand' | 'scan-me';
  setStyle: (style: 'default' | 'brand' | 'scan-me') => void;
}) {
  const t = useTranslations();

  return (
    <>
      <div className="mt-4 mb-2 font-semibold">{t('common.styles')}</div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        <button
          type="button"
          className={cn(
            'flex items-center justify-center rounded-lg border-2 p-4 text-center transition hover:border-foreground',
            style === 'default' && 'border-foreground bg-foreground/5'
          )}
          onClick={() => setStyle('default')}
        >
          <X className="h-8 w-8" />
        </button>
        <button
          type="button"
          className={cn(
            'flex items-center justify-center rounded-lg border-2 p-4 text-center transition hover:border-foreground',
            style === 'brand' && 'border-foreground bg-foreground/5'
          )}
          onClick={() => setStyle('brand')}
        >
          <div className="rounded-lg border bg-black p-2 font-bold text-white">
            <div className="aspect-square w-full rounded bg-white p-2 pb-0">
              <QRCodeCanvas
                value="..."
                size={128}
                marginSize={2}
                className="rounded-lg"
              />
            </div>
            <div className="mt-1 uppercase">
              <LogoTitle className="text-base" />
            </div>
          </div>
        </button>
        <button
          type="button"
          className={cn(
            'flex items-center justify-center rounded-lg border-2 p-4 text-center transition hover:border-foreground',
            style === 'scan-me' && 'border-foreground bg-foreground/5'
          )}
          onClick={() => setStyle('scan-me')}
        >
          <div className="rounded-lg border bg-black p-2 font-bold text-white">
            <div className="aspect-square w-full rounded bg-white p-2 pb-0">
              <QRCodeCanvas
                value="..."
                size={128}
                marginSize={2}
                className="rounded-lg"
              />
            </div>
            <div className="mt-1 uppercase">{t('common.scan_me')}</div>
          </div>
        </button>
      </div>
    </>
  );
}

export default QRStyles;
