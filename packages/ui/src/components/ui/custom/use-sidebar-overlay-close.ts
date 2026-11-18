import {
  useCallback,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/** Matches the reveal and conceal keyframe duration in globals.css. */
export const SIDEBAR_OVERLAY_CLOSE_MS = 180;
/** Closes anyway if the animation never reports its end (hidden tab, mobile). */
const CLOSE_FALLBACK_MS = SIDEBAR_OVERLAY_CLOSE_MS + 80;

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function useSidebarOverlayClose({
  enabled,
  isCollapsed,
  externalOverlayOpen,
  onMouseEnter,
  onMouseLeave,
}: {
  enabled: boolean;
  isCollapsed: boolean;
  externalOverlayOpen: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const [isClosing, setIsClosing] = useState(false);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [openOverlays, setOpenOverlays] = useState(0);
  const pendingLeave = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPinned = enabled && (externalOverlayOpen || openOverlays > 0);

  const registerOverlay = useCallback(() => {
    setOpenOverlays((count) => count + 1);
    return () => setOpenOverlays((count) => count - 1);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finishClose = useEffectEvent(() => {
    clearTimer();
    pendingLeave.current = false;
    setIsClosing(false);
    onMouseLeave?.();
  });

  const startClose = useEffectEvent(() => {
    if (isPinned || timerRef.current !== null) return;
    if (!enabled || isCollapsed || prefersReducedMotion()) {
      finishClose();
      return;
    }
    setIsClosing(true);
    timerRef.current = setTimeout(() => finishClose(), CLOSE_FALLBACK_MS);
  });

  const handleMouseLeave = useEffectEvent(() => {
    if (!onMouseLeave) return;
    pendingLeave.current = true;
    startClose();
  });

  const handleMouseEnter = useEffectEvent(() => {
    pendingLeave.current = false;
    clearTimer();
    setIsClosing(false);
    if (!isPinned) onMouseEnter?.();
  });

  useLayoutEffect(() => {
    if (isPinned) {
      clearTimer();
      setIsClosing(false);
    } else if (pendingLeave.current) {
      startClose();
    }
  }, [clearTimer, isPinned]);

  useLayoutEffect(() => {
    if (!panel) return;

    // Native boundary events track the actual panel even when a React portal
    // is logically its child. The open overlay keeps the panel pinned there.
    const enter = () => handleMouseEnter();
    const leave = () => handleMouseLeave();
    const animationEnd = (event: Event) => {
      if (event.target === panel && timerRef.current !== null) finishClose();
    };
    panel.addEventListener('mouseenter', enter);
    panel.addEventListener('mouseleave', leave);
    panel.addEventListener('animationend', animationEnd);
    return () => {
      panel.removeEventListener('mouseenter', enter);
      panel.removeEventListener('mouseleave', leave);
      panel.removeEventListener('animationend', animationEnd);
      clearTimer();
      pendingLeave.current = false;
    };
  }, [clearTimer, panel]);

  return {
    isClosing: isClosing && !isCollapsed && !isPinned,
    panelRef: setPanel,
    registerOverlay: enabled ? registerOverlay : null,
  };
}
