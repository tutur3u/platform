import { useDebouncedState } from '@mantine/hooks';
import useTranslation from 'next-translate/useTranslation';
import { useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  setQuery: (query: string) => void;
}

const GeneralSearchBar = ({ setQuery }: Props) => {
  const { t } = useTranslation('search');

  const searchLabel = t('search');
  const searchPlaceholder = t('search-placeholder');

  const [value, setValue] = useDebouncedState('', 300);

  useEffect(() => {
    setQuery(value);
  }, [value, setQuery]);

  return (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label>{searchLabel}</Label>
      <Input
        placeholder={searchPlaceholder}
        defaultValue={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
};

export default GeneralSearchBar;
