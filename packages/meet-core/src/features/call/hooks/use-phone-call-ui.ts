'use client';

import { useCallback, useEffect, useState } from 'react';

export type PhoneSheetKind = 'none' | 'live' | 'study';
export type PhoneLiveSheetTab = 'poll' | 'docs';
export type PhoneStudySheetTab = 'qa' | 'hand' | 'tutor';

const PHONE_MEDIA_QUERY = '(max-width: 639px)';

/**
 * Tracks whether the viewport is below the Tailwind `sm` breakpoint (< 640px).
 * Defaults to `false` during SSR so desktop hydration never flashes mobile chrome.
 */
export function useIsPhoneViewport(query = PHONE_MEDIA_QUERY): boolean {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    )
      return;

    const media = window.matchMedia(query);
    const sync = () => setIsPhone(media.matches);
    sync();

    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, [query]);

  return isPhone;
}

/**
 * Minimal additive controller for coordinating Screen C (Polls/Docs) and
 * Screen D (Student Study Tools) bottom sheets on phone viewports.
 */
export function usePhoneCallSheets() {
  const [activeSheet, setActiveSheet] = useState<PhoneSheetKind>('none');
  const [liveTab, setLiveTab] = useState<PhoneLiveSheetTab>('poll');
  const [studyTab, setStudyTab] = useState<PhoneStudySheetTab>('qa');

  const openLiveSheet = useCallback((tab?: PhoneLiveSheetTab) => {
    if (tab) setLiveTab(tab);
    setActiveSheet('live');
  }, []);

  const openStudySheet = useCallback((tab?: PhoneStudySheetTab) => {
    if (tab) setStudyTab(tab);
    setActiveSheet('study');
  }, []);

  const closeSheet = useCallback(() => {
    setActiveSheet('none');
  }, []);

  return {
    activeSheet,
    liveTab,
    setLiveTab,
    studyTab,
    setStudyTab,
    openLiveSheet,
    openStudySheet,
    closeSheet,
  };
}
