import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { QRCodeCanvas } from 'qrcode.react';

function QRDisplay({
  ref,
  value,
  color,
  bgColor,
  style,
  id,
}: {
  ref: React.RefObject<HTMLCanvasElement>;
  value: string;
  color: string;
  bgColor: string;
  style: 'default' | 'brand' | 'scan-me';
  id: string;
}) {
  const t = useTranslations();

  return (
    <div
      id={id}
      className={cn(
        'rounded-lg border p-2 text-center font-bold text-2xl uppercase',
        style === 'brand' || style === 'scan-me' 
          ? 'bg-black text-white' 
          : 'bg-white text-black'
      )}
    >
      <div
        className="aspect-square w-full rounded p-2 pb-0"
        style={{ backgroundColor: bgColor }}
      >
        <QRCodeCanvas
          ref={ref}
          value={value}
          size={256}
          marginSize={2}
          className="rounded-lg"
          fgColor={color}
          bgColor={bgColor}
        />
      </div>
      {style === 'brand' && (
        <div className="mt-1 uppercase">
          <LogoTitle forceShow={true} />
        </div>
      )}
      {style === 'scan-me' && (
        <div className="mt-1 uppercase">{t('common.scan_me')}</div>
      )}
    </div>
  );
}

export default QRDisplay;
