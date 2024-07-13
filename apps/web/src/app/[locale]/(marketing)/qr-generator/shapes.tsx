import { cn } from '@/lib/utils';
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
      <div className="mb-2 mt-4 font-semibold">{t('common.shapes')}</div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        <button
          className={cn(
            'hover:border-foreground flex items-center justify-center rounded-lg border-2 p-4 text-center transition',
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
            'hover:border-foreground flex items-center justify-center rounded-lg border-2 p-4 text-center transition',
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
            'hover:border-foreground flex items-center justify-center rounded-lg border-2 p-4 text-center transition',
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
