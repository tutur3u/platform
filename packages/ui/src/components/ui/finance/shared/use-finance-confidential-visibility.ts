import { useCallback, useEffect, useState } from 'react';

const CONFIDENTIAL_COOKIE_NAME = 'finance-confidential-mode';
const CONFIDENTIAL_MODE_CHANGE_EVENT = 'finance-confidential-mode-change';

export const FINANCE_HIDDEN_AMOUNT = '•••••';
export const FINANCE_HIDDEN_COMPACT_AMOUNT = '•••';

const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const nameEQ = `${name}=`;
  const cookies = document.cookie.split(';');
  for (let i = 0; i < cookies.length; i += 1) {
    let cookie = cookies[i];
    if (!cookie) continue;
    while (cookie.charAt(0) === ' ') cookie = cookie.substring(1);
    if (cookie.indexOf(nameEQ) === 0) {
      return cookie.substring(nameEQ.length);
    }
  }
  return null;
};

const setCookie = (name: string, value: string, days = 365) => {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  // biome-ignore lint/suspicious/noDocumentCookie: Used for finance numbers visibility persistence.
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
};

export function useFinanceConfidentialVisibility() {
  const [isConfidential, setIsConfidential] = useState(true);

  useEffect(() => {
    const saved = getCookie(CONFIDENTIAL_COOKIE_NAME);
    if (saved !== null) {
      setIsConfidential(saved === 'true');
    }

    const handleVisibilityChange = () => {
      const newValue = getCookie(CONFIDENTIAL_COOKIE_NAME);
      if (newValue !== null) {
        setIsConfidential(newValue === 'true');
      }
    };

    window.addEventListener(
      CONFIDENTIAL_MODE_CHANGE_EVENT,
      handleVisibilityChange
    );

    return () => {
      window.removeEventListener(
        CONFIDENTIAL_MODE_CHANGE_EVENT,
        handleVisibilityChange
      );
    };
  }, []);

  const toggleConfidential = useCallback(() => {
    const newValue = !isConfidential;
    setIsConfidential(newValue);
    setCookie(CONFIDENTIAL_COOKIE_NAME, String(newValue));
    window.dispatchEvent(new Event(CONFIDENTIAL_MODE_CHANGE_EVENT));
  }, [isConfidential]);

  return { isConfidential, toggleConfidential };
}
