import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { TextInput } from '@mantine/core';
import { useDebouncedState } from '@mantine/hooks';
import useTranslation from 'next-translate/useTranslation';
import { useEffect } from 'react';

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
    <TextInput
      label={searchLabel}
      placeholder={searchPlaceholder}
      defaultValue={value}
      onChange={(e) => setValue(e.target.value)}
      icon={<MagnifyingGlassIcon className="h-5" />}
    />
  );
};

export default GeneralSearchBar;
