'use client';
import { useTranslations } from 'next-intl';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';

const Context = createContext({
  dirty: false,
  setDirty: (_value: boolean) => {},
});
export const useNavigationGuard = () => useContext(Context);
export function NavigationGuard({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const t = useTranslations('lettin');
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      if (
        anchor instanceof HTMLAnchorElement &&
        anchor.target !== '_blank' &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', guard, true);
    return () => document.removeEventListener('click', guard, true);
  }, [dirty]);
  return (
    <Context.Provider value={{ dirty, setDirty }}>
      {children}
      {dirty && (
        <p
          role="status"
          className="fixed right-4 bottom-4 z-50 max-w-xs rounded-lg border bg-card p-3 text-sm shadow"
        >
          {t('saveBeforeSwitch')}
        </p>
      )}
    </Context.Provider>
  );
}
