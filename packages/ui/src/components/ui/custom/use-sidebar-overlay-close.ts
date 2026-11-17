import { useCallback, useEffect, useRef, useState } from 'react';

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

/**
 * Animates the hover-expand overlay closed before the app collapses it. On
 * mouse leave the expanded panel plays the conceal animation, then the app's
 * own onMouseLeave runs; entering again cancels the close. Reduced motion and
 * non-overlay sidebars collapse immediately.
 */
export function useSidebarOverlayClose({
  enabled,
  isCollapsed,
  onMouseEnter,
  onMouseLeave,
}: {
  enabled: boolean;
  isCollapsed: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const [isClosing, setIsClosing] = useState(false);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finishClose = useCallback(() => {
    clearTimer();
    setIsClosing(false);
    onMouseLeave?.();
  }, [clearTimer, onMouseLeave]);

  useEffect(() => clearTimer, [clearTimer]);

  const handleMouseLeave = useCallback(() => {
    if (!enabled || isCollapsed || prefersReducedMotion()) {
      onMouseLeave?.();
      return;
    }
    clearTimer();
    setIsClosing(true);
    timerRef.current = setTimeout(finishClose, CLOSE_FALLBACK_MS);
  }, [clearTimer, enabled, finishClose, isCollapsed, onMouseLeave]);

  const handleMouseEnter = useCallback(() => {
    if (isClosing) {
      clearTimer();
      setIsClosing(false);
    }
    onMouseEnter?.();
  }, [clearTimer, isClosing, onMouseEnter]);

  // While closing, the conceal animation is the only one on the panel, so
  // its own animationend marks the end; children's animations are ignored.
  // The native event is used because React maps onAnimationEnd to a
  // vendor-prefixed name when the runtime lacks AnimationEvent.
  useEffect(() => {
    if (!isClosing || !panel) return;
    const handleAnimationEnd = (event: Event) => {
      if (event.target === panel) finishClose();
    };
    panel.addEventListener('animationend', handleAnimationEnd);
    return () => panel.removeEventListener('animationend', handleAnimationEnd);
  }, [finishClose, isClosing, panel]);

  return {
    isClosing: isClosing && !isCollapsed,
    panelRef: setPanel,
    onMouseEnter: onMouseEnter || onMouseLeave ? handleMouseEnter : undefined,
    onMouseLeave: onMouseLeave ? handleMouseLeave : undefined,
  };
}
