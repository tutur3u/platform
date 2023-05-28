import { GlobeAltIcon } from '@heroicons/react/24/outline';
import { Select } from '@mantine/core';

import setLanguage from 'next-translate/setLanguage';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  fullWidth?: boolean;
  fullWidthOnMobile?: boolean;
  transparent?: boolean;
  hideOnMobile?: boolean;
  onChange?: () => void;
}

const LanguageSelector = ({
  fullWidth = false,
  fullWidthOnMobile = false,
  transparent = false,
  hideOnMobile = false,
  onChange,
}: Props) => {
  const { lang } = useTranslation();

  const data = [
    { label: 'English', value: 'en' },
    { label: 'Tiếng Việt', value: 'vi' },
  ];

  const setCookie = (locale: string) => {
    const date = new Date();
    const expireMs = 365 * 24 * 60 * 60 * 1000; // 365 days
    date.setTime(date.getTime() + expireMs);
    document.cookie = `NEXT_LOCALE=${locale};expires=${date.toUTCString()};path=/`;
  };

  return (
    <Select
      value={lang}
      icon={<GlobeAltIcon className="h-5 w-5" />}
      onChange={async (lang) => {
        const newLang = lang || 'en';

        await setLanguage(newLang);
        setCookie(newLang);

        if (onChange) onChange();
      }}
      data={data}
      className={`font-semibold ${
        fullWidthOnMobile ? 'w-full md:w-40' : fullWidth ? 'w-full' : 'w-40'
      } ${hideOnMobile ? 'hidden md:block' : ''}`}
      classNames={{
        input: transparent
          ? 'text-zinc-300 bg-zinc-300/10 border-zinc-300/10'
          : undefined,
        dropdown: transparent
          ? 'bg-[#5f4c3e] border-zinc-300/10 dark:bg-[#5f4c3e] dark:border-zinc-300/10'
          : undefined,
        item: transparent
          ? 'text-zinc-300 hover:bg-zinc-300/20 hover:text-zinc-200'
          : undefined,
        itemsWrapper: 'gap-1',
      }}
    />
  );
};

export default LanguageSelector;
