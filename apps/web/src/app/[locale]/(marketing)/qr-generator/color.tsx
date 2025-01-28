import { ColorPicker } from '@repo/ui/components/ui/color-picker';
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
        className="line-clamp-1 w-full grow-0 break-all text-ellipsis whitespace-nowrap"
      />

      <ColorPicker
        text={t('common.background')}
        value={bgColor}
        onChange={setBgColor}
        className="line-clamp-1 w-full grow-0 break-all text-ellipsis whitespace-nowrap"
      />
    </div>
  );
}

export default QRColorPicker;
