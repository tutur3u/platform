'use client';

import { useState } from 'react';
import { Button } from '../button';
import { LoadingIndicator } from './loading-indicator';
import {
  persistLocalePreference,
  reloadForLocaleChange,
} from './locale-preference';

export function LanguageToggle({
  forceDisplay = false,
  currentLocale,
}: {
  forceDisplay?: boolean;
  currentLocale: string;
}) {
  const [loading, setLoading] = useState(false);

  const updateLocale = () => {
    setLoading(true);

    try {
      persistLocalePreference(currentLocale === 'en' ? 'vi' : 'en');
      reloadForLocaleChange();
    } catch (error) {
      console.error('Failed to update locale', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={updateLocale}
      disabled={loading}
      className={forceDisplay ? 'flex-none' : 'hidden flex-none md:flex'}
    >
      {loading ? <LoadingIndicator /> : currentLocale}
      <span className="sr-only">Toggle language</span>
    </Button>
  );
}
