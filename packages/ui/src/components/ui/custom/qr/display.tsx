import { QRWorkspaceTitle } from '@tuturuuu/ui/custom/qr/workspace-title';
import { cn } from '@tuturuuu/utils/format';
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

export default function QRDisplay({
  canvasRef,
  value,
  color,
  bgColor,
  style,
  imageSettings,
  customTitle,
  id,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  value: string;
  color: string;
  bgColor: string;
  style: 'default' | 'brand' | 'scan-me';
  imageSettings?: ImageSettings | null;
  customTitle?: string;
  id: string;
}) {
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
          ref={canvasRef}
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
          {customTitle ? (
            <div className="mx-auto w-64 text-balance break-all px-2 text-center font-bold text-2xl uppercase leading-tight">
              {customTitle}
            </div>
          ) : (
            <QRWorkspaceTitle />
          )}
        </div>
      )}
      {style === 'scan-me' && <div className="mt-1 uppercase">Scan Me</div>}
    </div>
  );
}
