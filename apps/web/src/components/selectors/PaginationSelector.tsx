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
  items: number;
  setItems: (items: number) => void;
  options?: number[];
  evenNumbers?: boolean;
}

const PaginationSelector = ({
  items,
  setItems,
  options,
  evenNumbers = false,
}: Props) => {
  const { t } = useTranslation('pagination');

  const oddOptions = [1, 3, 7, 11, 15, 35, 55, 75, 95];
  const evenOptions = [2, 4, 8, 12, 16, 36, 56, 76, 96];

  const defaultOptions = evenNumbers ? evenOptions : oddOptions;

  const data = (options ?? defaultOptions).map((val) => ({
    value: val.toString(),
    label: `${val} ${t('items')}`,
  }));

  return (
    <div className="grid w-full items-center gap-1.5">
      <Label>{t('items_per_page')}</Label>
      <Select
        value={items.toString()}
        onValueChange={(value) => setItems(parseInt(value || '15'))}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('select_items_per_page')} />
        </SelectTrigger>
        <SelectContent>
          {data.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default PaginationSelector;
