import LogoTitle from '../../logo-title';
import { cn } from '@tuturuuu/utils';
import { useTranslations } from 'next-intl';
import { QRCode } from 'react-qrcode-logo';

function QRDisplay({
  ref,
  value,
  color,
  bgColor,
  shape,
  style,
}: {
  ref: React.RefObject<QRCode>;
  value: string;
  color: string;
  bgColor: string;
  shape: 'squares' | 'dots' | 'fluid';
  style: 'default' | 'brand' | 'scan-me';
}) {
  const t = useTranslations();

  return (
    <div
      className={cn(
        'rounded-lg border p-2 text-center text-2xl font-bold text-white uppercase',
        style === 'brand' || style === 'scan-me' ? 'bg-black' : ''
      )}
    >
      <div
        className="aspect-square w-full rounded p-2 pb-0"
        style={{ backgroundColor: bgColor }}
      >
        <QRCode
          ref={ref}
          value={value}
          size={256}
          quietZone={0}
          qrStyle={shape}
          fgColor={color}
          bgColor={bgColor}
        />
      </div>
      {style === 'brand' && (
        <div className="mt-1 uppercase">
          <LogoTitle />
        </div>
      )}
      {style === 'scan-me' && (
        <div className="mt-1 uppercase">{t('common.scan_me')}</div>
      )}
    </div>
  );
}

export default QRDisplay;
