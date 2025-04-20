import { ColorPicker } from '@tuturuuu/ui/color-picker';
import { useTranslations } from 'next-intl';

function QRColorPicker({
  color,
  setColor,
  bgColor,
  setBgColor,
}: {
  color: string;
  setColor: (color: string) => void;
  bgColor: string;
  setBgColor: (color: string) => void;
}) {
  const t = useTranslations();

  return (
    <div className="mt-2 flex gap-2">
      <ColorPicker
        text={t('common.foreground')}
        value={color}
        onChange={setColor}
        className="line-clamp-1 w-full grow-0 text-ellipsis whitespace-nowrap break-all"
      />

      <ColorPicker
        text={t('common.background')}
        value={bgColor}
        onChange={setBgColor}
        className="line-clamp-1 w-full grow-0 text-ellipsis whitespace-nowrap break-all"
      />
    </div>
  );
}

export default QRColorPicker;
