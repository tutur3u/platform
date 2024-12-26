'use client';
import React, { useState, useEffect } from 'react';
import LoadingIndicator from '@/components/common/LoadingIndicator';
// import { Locale } from '@/i18n/routing';
import { Button } from '@repo/ui/components/ui/button';

export default function LanguageToggle() {
  const [loading, setLoading] = useState(true);
  const forceDisplay = true;


  useEffect(() => {

    const loadPageContent = async () => {

      setTimeout(() => {
        setLoading(false); 
      }, 2000);
    };

    loadPageContent();
  }, []); 

  const currentLocale = 'EN'; 

  return (
    <Button
      variant="outline"
      size="icon"

      className={forceDisplay ? 'flex-none' : 'hidden flex-none md:flex'}
    >
      {loading ? <LoadingIndicator /> : currentLocale}
      <span className="sr-only">Toggle language</span>
    </Button>
  );
}
