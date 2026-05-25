import { useCallback, useEffect, useState } from 'react';

const CONFIDENTIAL_COOKIE_NAME = 'finance-confidential-mode';

const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const nameEQ = `${name}=`;
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i += 1) {
    let c = ca[i];
    if (!c) continue;
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
};

const setCookie = (name: string, value: string, days = 365) => {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  // biome-ignore lint/suspicious/noDocumentCookie: Used for finance confidential mode state persistence
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
};

export function useFinanceConfidentialVisibility() {
  const [isConfidential, setIsConfidential] = useState(true);

  useEffect(() => {
    const saved = getCookie(CONFIDENTIAL_COOKIE_NAME);
    if (saved !== null) {
      setIsConfidential(saved === 'true');
    }

    const handleStorageChange = () => {
      const newValue = getCookie(CONFIDENTIAL_COOKIE_NAME);
      if (newValue !== null) {
        setIsConfidential(newValue === 'true');
      }
    };

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

  const toggleConfidential = useCallback(() => {
    const newValue = !isConfidential;
    setIsConfidential(newValue);
    setCookie(CONFIDENTIAL_COOKIE_NAME, String(newValue));
    window.dispatchEvent(new Event('finance-confidential-mode-change'));
  }, [isConfidential]);

  return { isConfidential, toggleConfidential };
}
