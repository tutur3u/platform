import setLanguage from 'next-translate/setLanguage';
import { useEffect } from 'react';

const usePersistLocale = () => {
  useEffect(() => {
    // On the first render, set the language to the current locale.
    // Get the current locale from the cookie.
    const cookieLocale = document.cookie
      .split('; ')
      .find((row) => row.startsWith('NEXT_LOCALE='))
      ?.split('=')[1];

    // If the locale is already set in the cookie, set the language.
    if (cookieLocale) {
      setLanguage(cookieLocale);
      return;
    }
  }, []);
};

export default usePersistLocale;
