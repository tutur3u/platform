'use client';

import { Eye, EyeOff } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '../../button';

// Cookie helper functions
const setCookie = (name: string, value: string, days = 365) => {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  // biome-ignore lint/suspicious/noDocumentCookie: Used for finance confidential mode state persistence
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
};

const getCookie = (name: string): string | null => {
  const nameEQ = `${name}=`;
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    if (!c) continue;
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
};

export function DashboardHeader() {
  const t = useTranslations('transaction-data-table');
  const [isConfidential, setIsConfidential] = useState(true); // Default to hidden

  // Load confidential mode from cookie on mount
  useEffect(() => {
    const saved = getCookie('finance-confidential-mode');
    if (saved !== null) {
      setIsConfidential(saved === 'true');
    }

    // Listen for changes from other components
    const handleStorageChange = () => {
      const newValue = getCookie('finance-confidential-mode');
      if (newValue !== null) {
        setIsConfidential(newValue === 'true');
      }
    };

    // Custom event for same-tab updates
    window.addEventListener(
      'finance-confidential-mode-change',
      handleStorageChange as EventListener
    );

    return () => {
      window.removeEventListener(
        'finance-confidential-mode-change',
        handleStorageChange as EventListener
      );
    };
  }, []);

  const toggleConfidential = () => {
    const newValue = !isConfidential;
    setIsConfidential(newValue);
    setCookie('finance-confidential-mode', String(newValue));

    // Trigger event for other components in the same tab
    window.dispatchEvent(new Event('finance-confidential-mode-change'));
  };

  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h2 className="font-bold text-2xl text-foreground tracking-tight">
          {t('financial_overview') || 'Financial Overview'}
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {t('financial_overview_description') ||
            'Track your income, expenses, and overall financial health'}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={toggleConfidential}
        className="gap-2"
      >
        {isConfidential ? (
          <>
            <EyeOff className="h-4 w-4" />
            <span className="hidden sm:inline">{t('show_confidential')}</span>
          </>
        ) : (
          <>
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">{t('hide_confidential')}</span>
          </>
        )}
      </Button>
    </div>
  );
}
