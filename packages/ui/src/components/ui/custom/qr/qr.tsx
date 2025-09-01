'use client';

import { Button } from '@tuturuuu/ui/button';
import QRColorPicker from '@tuturuuu/ui/custom/qr/color';
import QRDisplay from '@tuturuuu/ui/custom/qr/display';
import QRFormats from '@tuturuuu/ui/custom/qr/formats';
import QRImageUpload from '@tuturuuu/ui/custom/qr/image-upload';
import QRStyles from '@tuturuuu/ui/custom/qr/styles';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import html2canvas from 'html2canvas-pro';
import { useTranslations } from 'next-intl';
import { useCallback, useId, useRef, useState } from 'react';

interface ImageSettings {
  src: string;
  originalSrc: string;
  width: number;
  height: number;
  excavate: boolean;
  opacity?: number;
  rounded?: boolean;
}

export default function QR() {
  const t = useTranslations();

  const ref = useRef<HTMLCanvasElement>(null);

  const [value, setValue] = useState('');
  const [style, setStyle] = useState<'default' | 'brand' | 'scan-me'>(
    'default'
  );
  const [format, setFormat] = useState<'png' | 'jpg' | 'webp'>('png');
  const [imageSettings, setImageSettings] = useState<ImageSettings | null>(
    null
  );

  const [color, setColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const qrId = useId();

  const handleDownload = useCallback(async () => {
    const qrDisplayElement = document.getElementById(qrId);
    if (!qrDisplayElement) return;

    try {
      const canvas = await html2canvas(qrDisplayElement, {
        backgroundColor: null,
        scale: 2, // Higher quality
        useCORS: true,
        logging: false,
      });

      const link = document.createElement('a');
      link.download = `Tuturuuu-${style}-${Date.now()}.${format}`;
      link.href = canvas.toDataURL(`image/${format}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to export QR code:', error);
      // Fallback to canvas export for default style
      if (style === 'default' && ref.current) {
        const canvas = ref.current;
        const link = document.createElement('a');
        link.download = `Tuturuuu.${format}`;
        link.href = canvas.toDataURL(`image/${format}`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  }, [style, format, qrId]);

  return (
    <div className="flex flex-col items-center justify-between gap-8 md:flex-row md:items-start">
      <div className="w-full">
        <div className="grid gap-2">
          <Label>{t('ws-user-fields.value')}</Label>
          <Textarea
            placeholder={t('ws-user-fields.value')}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>

        <QRColorPicker
          color={color}
          setColor={setColor}
          bgColor={bgColor}
          setBgColor={setBgColor}
        />

        <QRImageUpload
          imageSettings={imageSettings}
          setImageSettings={setImageSettings}
        />

        <QRStyles
          style={style}
          setStyle={setStyle}
          imageSettings={imageSettings}
        />
        <QRFormats format={format} setFormat={setFormat} />
      </div>
      <div>
        <QRDisplay
          ref={ref as React.RefObject<HTMLCanvasElement>}
          value={value}
          color={color}
          bgColor={bgColor}
          style={style}
          imageSettings={imageSettings}
          id={qrId}
        />
        <div className="mt-2 flex gap-2">
          <Button
            variant="destructive"
            onClick={() => {
              setValue('');
              setColor('#000000');
              setBgColor('#FFFFFF');
              setStyle('default');
              setImageSettings(null);
            }}
            disabled={
              !value &&
              color === '#000000' &&
              bgColor === '#FFFFFF' &&
              style === 'default' &&
              !imageSettings
            }
          >
            {t('common.reset')}
          </Button>
          <Button className="w-full" onClick={handleDownload}>
            {t('common.download')}
          </Button>
        </div>
      </div>
    </div>
  );
}
