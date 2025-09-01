import { QRWorkspaceTitle } from '@tuturuuu/ui/custom/qr/workspace-title';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { QRCodeCanvas } from 'qrcode.react';

interface ImageSettings {
  src: string;
  originalSrc: string;
  width: number;
  height: number;
  excavate: boolean;
  opacity?: number;
  rounded?: boolean;
}

function QRDisplay({
  ref,
  value,
  color,
  bgColor,
  style,
  imageSettings,
  id,
}: {
  ref: React.RefObject<HTMLCanvasElement>;
  value: string;
  color: string;
  bgColor: string;
  style: 'default' | 'brand' | 'scan-me';
  imageSettings?: ImageSettings | null;
  id: string;
}) {
  const t = useTranslations();

  return (
    <div
      id={id}
      className={cn(
        'rounded-lg border p-2 text-center font-bold text-2xl uppercase',
        style === 'brand' || style === 'scan-me' ? 'bg-black text-white' : ''
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
          level="H"
          imageSettings={
            imageSettings
              ? {
                  src: imageSettings.src,
                  width: imageSettings.width,
                  height: imageSettings.height,
                  excavate: imageSettings.excavate,
                  opacity: imageSettings.opacity || 1,
                }
              : undefined
          }
        />
      </div>
      {style === 'brand' && (
        <div className="mt-1 uppercase">
          <QRWorkspaceTitle />
        </div>
      )}
      {style === 'scan-me' && (
        <div className="mt-1 uppercase">{t('common.scan_me')}</div>
      )}
    </div>
  );
}

export default QRDisplay;
