import useTranslation from 'next-translate/useTranslation';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type Mode = 'list' | 'grid';

interface Props {
  mode: Mode;
  setMode: (mode: Mode) => void;
  showAll?: boolean;
}

const ModeSelector = ({ mode, setMode, showAll = false }: Props) => {
  const { t } = useTranslation('view-mode');

  const options = showAll
    ? [
        {
          label: t('list_view'),
          value: 'list',
        },
        {
          label: t('grid_view'),
          value: 'grid',
        },
      ]
    : mode === 'list'
      ? [
          {
            label: t('list_view'),
            value: 'list',
          },
        ]
      : [
          {
            label: t('grid_view'),
            value: 'grid',
          },
        ];

  return (
    <div className="grid w-full items-center gap-1.5">
      <Label>{t('view_mode')}</Label>
      <Select value={mode} onValueChange={setMode}>
        <SelectTrigger>
          <SelectValue placeholder={t('select_view_mode')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default ModeSelector;
