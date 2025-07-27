import { useEffect, useState } from 'react';

const TIMEZONE_INDICATOR_KEY = 'tumeet_timezone_indicator_visible';

export function useTimezonePreference() {
  const [isVisible, setIsVisible] = useState(true);

  // Load preference from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(TIMEZONE_INDICATOR_KEY);
    if (saved !== null) {
      setIsVisible(JSON.parse(saved));
    }
  }, []);

  // Save preference to localStorage when it changes
  const setVisible = (visible: boolean) => {
    setIsVisible(visible);
    localStorage.setItem(TIMEZONE_INDICATOR_KEY, JSON.stringify(visible));
  };

  return [isVisible, setVisible] as const;
}
