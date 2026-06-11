'use client';

import { useCallback, useEffect, useState } from 'react';

const BALANCE_MODE_COOKIE_NAME = 'finance-balance-mode';
const BALANCE_MODE_CHANGE_EVENT = 'finance-balance-mode-change';

export type FinanceBalanceMode = 'audited' | 'ledger';

const isBalanceMode = (value: string | null): value is FinanceBalanceMode =>
  value === 'audited' || value === 'ledger';

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
  // biome-ignore lint/suspicious/noDocumentCookie: Used for finance balance mode persistence.
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
};

export function useFinanceBalanceMode() {
  const [mode, setModeState] = useState<FinanceBalanceMode>('ledger');

  useEffect(() => {
    const saved = getCookie(BALANCE_MODE_COOKIE_NAME);
    if (isBalanceMode(saved)) {
      setModeState(saved);
    }

    const handleBalanceModeChange = () => {
      const nextValue = getCookie(BALANCE_MODE_COOKIE_NAME);
      if (isBalanceMode(nextValue)) {
        setModeState(nextValue);
      }
    };

    window.addEventListener(BALANCE_MODE_CHANGE_EVENT, handleBalanceModeChange);

    return () => {
      window.removeEventListener(
        BALANCE_MODE_CHANGE_EVENT,
        handleBalanceModeChange
      );
    };
  }, []);

  const setMode = useCallback((nextMode: FinanceBalanceMode) => {
    setModeState(nextMode);
    setCookie(BALANCE_MODE_COOKIE_NAME, nextMode);
    window.dispatchEvent(new Event(BALANCE_MODE_CHANGE_EVENT));
  }, []);

  return {
    isAuditedMode: mode === 'audited',
    mode,
    setMode,
  };
}
