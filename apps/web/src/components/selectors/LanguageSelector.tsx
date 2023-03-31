import { GlobeAltIcon } from '@heroicons/react/24/outline';
import { Select } from '@mantine/core';

import setLanguage from 'next-translate/setLanguage';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  fullWidth?: boolean;
  transparent?: boolean;
  hideOnMobile?: boolean;
  onChange?: () => void;
}

const LanguageSelector = ({
  fullWidth = false,
  transparent = false,
  hideOnMobile = false,
  onChange,
}: Props) => {
  const { lang } = useTranslation();

  const data = [
    { label: 'English', value: 'en' },
    { label: 'Tiếng Việt', value: 'vi' },
  ];

  return (
    <Select
      value={lang}
      icon={<GlobeAltIcon className="h-5 w-5" />}
      onChange={async (lang) => {
        await setLanguage(lang || 'en');
        if (onChange) onChange();
      }}
      data={data}
      className={`${fullWidth ? 'w-full' : 'w-36'} ${
        hideOnMobile ? 'hidden md:block' : ''
      }`}
      classNames={{
        input: transparent ? 'bg-zinc-300/10 border-zinc-300/10' : undefined,
        dropdown: transparent ? 'bg-[#5f4c3e] border-zinc-300/10' : undefined,
        item: transparent
          ? 'hover:bg-zinc-300/20 hover:text-zinc-200'
          : undefined,
        itemsWrapper: 'gap-1',
      }}
    />
  );
};

export default LanguageSelector;
