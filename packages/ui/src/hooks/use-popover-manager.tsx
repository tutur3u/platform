'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Custom hook for popover management
export function usePopoverManager() {
  const moreButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const popoverContentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [openPopoverIdx, setOpenPopoverIdx] = useState<number | null>(null);
  const [scrollStates, setScrollStates] = useState<Record<number, { top: boolean; bottom: boolean }>>({});
  const [popoverHovered, setPopoverHovered] = useState<Record<number, boolean>>({});

  // Handler to close popover on scroll/resize
  const handleClose = useCallback((event: Event) => {
    const popoverEl = popoverContentRefs.current[openPopoverIdx!];
    if (popoverHovered[openPopoverIdx!]) return;
    if (!popoverEl) {
      setOpenPopoverIdx(null);
      return;
    }
    if (event.target instanceof Node && popoverEl.contains(event.target as Node)) {
      return;
    }
    setOpenPopoverIdx(null);
  }, [openPopoverIdx, popoverHovered]);

  useEffect(() => {
    if (openPopoverIdx !== null) {
      window.addEventListener('scroll', handleClose, true);
      window.addEventListener('resize', handleClose);
      return () => {
        window.removeEventListener('scroll', handleClose, true);
        window.removeEventListener('resize', handleClose);
      };
    }
  }, [openPopoverIdx, handleClose]);

  // Set initial scroll state when popover opens
  useEffect(() => {
    if (openPopoverIdx !== null) {
      const el = popoverContentRefs.current[openPopoverIdx];
      if (el) {
        setScrollStates(prev => ({
          ...prev,
          [openPopoverIdx]: {
            top: el.scrollTop > 0,
            bottom: el.scrollTop + el.clientHeight < el.scrollHeight,
          },
        }));
      }
    }
  }, [openPopoverIdx]);

  // Helper to handle scroll shadow indicators
  const handlePopoverScroll = useCallback((e: React.UIEvent<HTMLDivElement>, idx: number) => {
    const el = e.currentTarget;
    setScrollStates((prev) => ({
      ...prev,
      [idx]: {
        top: el.scrollTop > 0,
        bottom: el.scrollTop + el.clientHeight < el.scrollHeight,
      },
    }));
  }, []);

  // Cleanup refs on unmount
  useEffect(() => {
    return () => {
      moreButtonRefs.current = [];
      popoverContentRefs.current = [];
    };
  }, []);

  return {
    moreButtonRefs,
    popoverContentRefs,
    openPopoverIdx,
    setOpenPopoverIdx,
    scrollStates,
    popoverHovered,
    setPopoverHovered,
    handlePopoverScroll,
  };
} 