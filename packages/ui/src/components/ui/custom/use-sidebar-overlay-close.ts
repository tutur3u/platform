import {
  useCallback,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { readFocusModality } from './focus-modality';

/** Matches the reveal and conceal keyframe duration in globals.css. */
export const SIDEBAR_OVERLAY_CLOSE_MS = 180;
/** Closes anyway if the animation never reports its end (hidden tab, mobile). */
const CLOSE_FALLBACK_MS = SIDEBAR_OVERLAY_CLOSE_MS + 80;

/** The logo button that stands in for the sidebar in minimal mode. */
export const SIDEBAR_REVEAL_TRIGGER_SELECTOR = '[data-sidebar-reveal-trigger]';
/** The element that runs the conceal animation when it is not the panel. */
const SURFACE_ATTRIBUTE = 'data-sidebar-overlay-surface';
/** Overlays opened from the sidebar render in portals outside the panel. */
const PORTAL_SELECTOR =
  '[data-radix-popper-content-wrapper],[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]';
const FOCUSABLE_SELECTOR =
  'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';

/** Why the overlay is open. It closes when no reason is left. */
type Hold = 'hover' | 'focus' | 'tap';

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Focus that arrived by keyboard; a click or tap never counts. */
function isKeyboardFocus(target: EventTarget | null) {
  const modality = readFocusModality();
  if (modality) return modality === 'keyboard';
  try {
    return target instanceof Element && target.matches(':focus-visible');
  } catch {
    return false;
  }
}

function focusableWithin(panel: HTMLElement) {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.hasAttribute('disabled') &&
      !element.closest('[hidden],[inert]') &&
      (typeof element.checkVisibility !== 'function' ||
        element.checkVisibility())
  );
}

export function useSidebarOverlayClose({
  enabled,
  isCollapsed,
  externalOverlayOpen,
  onMouseEnter,
  onMouseLeave,
  revealTrigger = false,
  openDelayMs = 0,
  closeDelayMs = 0,
}: {
  enabled: boolean;
  isCollapsed: boolean;
  externalOverlayOpen: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /**
   * The panel holds a reveal trigger (`SIDEBAR_REVEAL_TRIGGER_SELECTOR`):
   * keyboard focus or a tap opens the overlay too, Escape or a press outside
   * closes it, and Tab stays inside while it is open.
   */
  revealTrigger?: boolean;
  /** Hover intent: how long the pointer rests before the overlay opens. */
  openDelayMs?: number;
  /** How long the pointer may be away before the overlay starts to close. */
  closeDelayMs?: number;
}) {
  const [isClosing, setIsClosing] = useState(false);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [openOverlays, setOpenOverlays] = useState(0);
  const holds = useRef(new Set<Hold>());
  const pendingLeave = useRef(false);
  const touchPointer = useRef(false);
  const ignoreTriggerFocus = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const clearDelay = useCallback(() => {
    if (delayRef.current !== null) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
    }
  }, []);

  const finishClose = useEffectEvent(() => {
    clearTimer();
    clearDelay();
    pendingLeave.current = false;
    setIsClosing(false);
    onMouseLeave?.();
  });

  const conceal = useEffectEvent(() => {
    if (prefersReducedMotion()) {
      finishClose();
      return;
    }
    setIsClosing(true);
    timerRef.current = setTimeout(() => finishClose(), CLOSE_FALLBACK_MS);
  });

  const startClose = useEffectEvent((immediate = false) => {
    if (isPinned || timerRef.current !== null) return;
    if (!enabled || isCollapsed) {
      finishClose();
      return;
    }
    clearDelay();
    if (immediate || closeDelayMs <= 0) {
      conceal();
      return;
    }
    delayRef.current = setTimeout(() => {
      delayRef.current = null;
      conceal();
    }, closeDelayMs);
  });

  const hold = useEffectEvent((reason: Hold) => {
    holds.current.add(reason);
    pendingLeave.current = false;
    clearTimer();
    setIsClosing(false);
    if (isPinned) {
      clearDelay();
      return;
    }
    // Only a resting pointer waits; focus and taps open at once.
    if (reason === 'hover' && isCollapsed && openDelayMs > 0) {
      delayRef.current ??= setTimeout(() => {
        delayRef.current = null;
        onMouseEnter?.();
      }, openDelayMs);
      return;
    }
    clearDelay();
    onMouseEnter?.();
  });

  const release = useEffectEvent((reason: Hold) => {
    holds.current.delete(reason);
    if (holds.current.size > 0) return;
    if (!onMouseLeave) {
      clearDelay();
      return;
    }
    pendingLeave.current = true;
    startClose();
  });

  /** Closes now, whatever was holding the overlay open. */
  const dismiss = useEffectEvent((restoreFocus: boolean) => {
    const trigger = panel?.querySelector<HTMLElement>(
      SIDEBAR_REVEAL_TRIGGER_SELECTOR
    );
    const hadFocus = panel?.contains(document.activeElement) ?? false;
    holds.current.clear();
    if (onMouseLeave) {
      pendingLeave.current = true;
      startClose(true);
    }
    // The panel content unmounts, so focus goes back to the trigger. That
    // focus must not reopen the overlay.
    if (restoreFocus && hadFocus && trigger) {
      ignoreTriggerFocus.current = true;
      trigger.focus({ preventScroll: true });
    }
  });

  const handleTriggerClick = useEffectEvent((trigger: HTMLElement) => {
    if (isCollapsed) {
      hold('tap');
      trigger.focus({ preventScroll: true });
    } else dismiss(true);
  });

  const handleLinkClick = useEffectEvent(() => {
    // A destination picked by keyboard or tap closes the overlay; a hovering
    // pointer keeps it until it leaves.
    if (holds.current.has('tap') || holds.current.has('focus')) dismiss(true);
  });

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!panel || isCollapsed || isClosing) return;
    if (event.key === 'Escape') {
      // An overlay opened from the sidebar takes the first Escape.
      if (!event.defaultPrevented && !isPinned) dismiss(true);
      return;
    }
    const active = document.activeElement;
    if (event.key !== 'Tab' || !active || !panel.contains(active)) return;
    const focusable = focusableWithin(panel);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey ? active === first : active === last) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  });

  const handleOutsidePress = useEffectEvent((event: PointerEvent) => {
    const target = event.target;
    if (!panel || isCollapsed || isPinned || !(target instanceof Element)) {
      return;
    }
    if (panel.contains(target) || target.closest(PORTAL_SELECTOR)) return;
    dismiss(false);
  });

  useLayoutEffect(() => {
    if (isPinned) {
      clearTimer();
      clearDelay();
      setIsClosing(false);
    } else if (pendingLeave.current) {
      startClose();
    }
  }, [clearDelay, clearTimer, isPinned]);

  // A collapse from anywhere ends keyboard and tap holds; only a pointer that
  // is still inside keeps its own.
  useLayoutEffect(() => {
    if (!isCollapsed) return;
    holds.current.delete('focus');
    holds.current.delete('tap');
  }, [isCollapsed]);

  useLayoutEffect(() => {
    if (!panel || !enabled) return;

    // Native boundary events track the actual panel even when a React portal
    // is logically its child. The open overlay keeps the panel pinned there.
    const pointerEnter = (event: PointerEvent) => {
      touchPointer.current = event.pointerType === 'touch';
    };
    const enter = () => {
      // A tap also reports a hover that never ends; its click opens instead.
      if (revealTrigger && touchPointer.current) return;
      hold('hover');
    };
    const leave = () => release('hover');
    const animationEnd = (event: Event) => {
      const target = event.target;
      const isSurface =
        target === panel ||
        (target instanceof Element && target.hasAttribute(SURFACE_ATTRIBUTE));
      if (isSurface && timerRef.current !== null) finishClose();
    };
    panel.addEventListener('pointerenter', pointerEnter);
    panel.addEventListener('mouseenter', enter);
    panel.addEventListener('mouseleave', leave);
    panel.addEventListener('animationend', animationEnd);
    return () => {
      panel.removeEventListener('pointerenter', pointerEnter);
      panel.removeEventListener('mouseenter', enter);
      panel.removeEventListener('mouseleave', leave);
      panel.removeEventListener('animationend', animationEnd);
      clearTimer();
      clearDelay();
      pendingLeave.current = false;
    };
  }, [clearDelay, clearTimer, enabled, panel, revealTrigger]);

  useLayoutEffect(() => {
    if (!panel || !revealTrigger) return;

    const focusIn = (event: FocusEvent) => {
      const target = event.target;
      const onTrigger =
        target instanceof Element &&
        target.matches(SIDEBAR_REVEAL_TRIGGER_SELECTOR);
      if (ignoreTriggerFocus.current && onTrigger) return;
      ignoreTriggerFocus.current = false;
      if (!holds.current.has('focus') && isKeyboardFocus(target)) {
        hold('focus');
      }
    };
    const focusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node) {
        if (panel.contains(next)) return;
      } else if (!document.hasFocus()) {
        // Another window took focus; it returns to the same element.
        return;
      }
      ignoreTriggerFocus.current = false;
      if (holds.current.has('focus')) release('focus');
    };
    const click = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const trigger = target.closest(SIDEBAR_REVEAL_TRIGGER_SELECTOR);
      if (trigger instanceof HTMLElement) handleTriggerClick(trigger);
      else if (target.closest('a[href]')) handleLinkClick();
    };
    const keyDown = (event: KeyboardEvent) => handleKeyDown(event);
    const outsidePress = (event: PointerEvent) => handleOutsidePress(event);
    panel.addEventListener('focusin', focusIn);
    panel.addEventListener('focusout', focusOut);
    panel.addEventListener('click', click);
    document.addEventListener('keydown', keyDown);
    document.addEventListener('pointerdown', outsidePress, true);
    return () => {
      panel.removeEventListener('focusin', focusIn);
      panel.removeEventListener('focusout', focusOut);
      panel.removeEventListener('click', click);
      document.removeEventListener('keydown', keyDown);
      document.removeEventListener('pointerdown', outsidePress, true);
      holds.current.delete('focus');
      holds.current.delete('tap');
      ignoreTriggerFocus.current = false;
    };
  }, [panel, revealTrigger]);

  return {
    isClosing: isClosing && !isCollapsed && !isPinned,
    panelRef: setPanel,
    registerOverlay: enabled ? registerOverlay : null,
  };
}
