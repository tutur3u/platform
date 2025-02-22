import { cn } from '@tuturuuu/utils';
import { useTranslations } from 'next-intl';
import { QRCode } from 'react-qrcode-logo';

function QRShapes({
  shape,
  setShape,
}: {
  shape: 'squares' | 'dots' | 'fluid';
  setShape: (shape: 'squares' | 'dots' | 'fluid') => void;
}) {
  const t = useTranslations();

  return (
    <>
      <div className="mt-4 mb-2 font-semibold">{t('common.shapes')}</div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        <button
          className={cn(
            'flex items-center justify-center rounded-lg border-2 p-4 text-center transition hover:border-foreground',
            shape === 'squares' && 'border-foreground bg-foreground/5'
          )}
          onClick={() => setShape('squares')}
        >
          <div className="rounded-lg border bg-black p-2 font-semibold text-white">
            <div className="aspect-square w-full rounded bg-white p-2 pb-0">
              <QRCode value="..." size={128} quietZone={0} qrStyle="squares" />
            </div>
          </div>
        </button>
        <button
          className={cn(
            'flex items-center justify-center rounded-lg border-2 p-4 text-center transition hover:border-foreground',
            shape === 'dots' && 'border-foreground bg-foreground/5'
          )}
          onClick={() => setShape('dots')}
        >
          <div className="rounded-lg border bg-black p-2 font-semibold text-white">
            <div className="aspect-square w-full rounded bg-white p-2 pb-0">
              <QRCode value="..." size={128} quietZone={0} qrStyle="dots" />
            </div>
          </div>
        </button>
        <button
          className={cn(
            'flex items-center justify-center rounded-lg border-2 p-4 text-center transition hover:border-foreground',
            shape === 'fluid' && 'border-foreground bg-foreground/5'
          )}
          onClick={() => setShape('fluid')}
        >
          <div className="rounded-lg border bg-black p-2 font-semibold text-white">
            <div className="aspect-square w-full rounded bg-white p-2 pb-0">
              <QRCode value="..." size={128} quietZone={0} qrStyle="fluid" />
            </div>
          </div>
        </button>
      </div>
    </>
  );
}

export default QRShapes;
