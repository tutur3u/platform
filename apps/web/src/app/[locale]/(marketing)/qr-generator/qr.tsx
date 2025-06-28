'use client';

import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import QRColorPicker from './color';
import QRDisplay from './display';
import QRFormats from './formats';
import QRStyles from './styles';

export default function QR() {
  const t = useTranslations();

  const ref = useRef<HTMLCanvasElement>(null);

  const [value, setValue] = useState('');
  const [style, setStyle] = useState<'default' | 'brand' | 'scan-me'>(
    'default'
  );
  const [format, setFormat] = useState<'png' | 'jpg' | 'webp'>('png');

  const [color, setColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#FFFFFF');

  return (
    <>
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

          <QRStyles style={style} setStyle={setStyle} />
          <QRFormats format={format} setFormat={setFormat} />
        </div>
        <div>
          <QRDisplay
            ref={ref as React.RefObject<HTMLCanvasElement>}
            value={value}
            color={color}
            bgColor={bgColor}
            style={style}
          />
          <div className="mt-2 flex gap-2">
            <Button
              variant="destructive"
              onClick={() => {
                setValue('');
                setColor('#000000');
                setBgColor('#FFFFFF');
                setStyle('default');
              }}
              disabled={
                !value &&
                color === '#000000' &&
                bgColor === '#FFFFFF' &&
                style === 'default'
              }
            >
              {t('common.reset')}
            </Button>
            <Button
              className="w-full"
              onClick={() => {
                if (!ref.current) return;

                const canvas = ref.current;
                const link = document.createElement('a');

                link.download = `Tuturuuu.${format}`;
                link.href = canvas.toDataURL(`image/${format}`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
            >
              {t('common.download')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
