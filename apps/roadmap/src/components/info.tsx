import { Info, X } from '@tuturuuu/icons';
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

/**
 * Explanations that stay out of the reading flow: an (i) disclosure for
 * paragraphs and a tooltip for a label's definition. Both are native HTML
 * popovers (`popovertarget`), so they work before hydration and without
 * JavaScript: a tap, Enter or Space opens them, Escape and a tap elsewhere
 * close them, and focus stays on (or returns to) the trigger. They open in
 * the top layer and never move the page. Their text is in the server HTML.
 * The boot script leaves `popovertarget` buttons to the browser
 * (src/boot/roadmap-boot.js).
 */

/** A CSS anchor name for one trigger; ids may hold any character. */
export function anchorStyle(id: string): CSSProperties {
  return {
    '--rm-anchor': `--${id.replace(/[^\w-]/g, '-')}`,
  } as CSSProperties;
}

/** Whether this browser has hint popovers; asked once per page. */
let hintSupport: boolean | undefined;
function supportsHint() {
  if (hintSupport === undefined) {
    const probe = document.createElement('span');
    probe.setAttribute('popover', 'hint');
    hintSupport = probe.popover === 'hint';
  }
  return hintSupport;
}

function isOpen(element: HTMLElement | null) {
  try {
    return Boolean(element?.matches(':popover-open'));
  } catch {
    return false;
  }
}

/**
 * An (i) button and the explanation it discloses. Non-modal: focus stays on
 * the button, Tab continues into the panel, Escape closes it.
 */
export function InfoPopover({
  id,
  label,
  title,
  closeLabel,
  children,
}: {
  id: string;
  /** The button's accessible name, e.g. "How statuses are computed". */
  label: string;
  /** Visible heading inside the panel; defaults to `label`. */
  title?: string;
  closeLabel: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // A tap before hydration opens the panel natively; adopt that state.
  useEffect(() => setOpen(isOpen(panelRef.current)), []);
  const anchor = anchorStyle(id);
  return (
    <>
      <button
        type="button"
        className="info-btn"
        popoverTarget={id}
        aria-controls={id}
        aria-expanded={open}
        aria-label={label}
        style={anchor}
      >
        <Info size={16} aria-hidden />
      </button>
      <div
        id={id}
        ref={panelRef}
        popover="auto"
        className="info-pop"
        aria-labelledby={`${id}-title`}
        style={anchor}
        onToggle={(event) => setOpen(event.newState === 'open')}
      >
        <div className="info-pop-head">
          <p className="info-pop-title" id={`${id}-title`}>
            {title ?? label}
          </p>
          <button
            type="button"
            className="info-close"
            popoverTarget={id}
            popoverTargetAction="hide"
            aria-label={closeLabel}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/**
 * A label whose definition shows on hover, focus, tap, Enter or Space. The
 * trigger names the label; `aria-describedby` reads the definition.
 * Hover and focus need hydration; tap and keys work from the first paint.
 * Where the browser has hint popovers, a tooltip never closes an open (i)
 * panel.
 */
export function Tooltip({
  id,
  tip,
  className,
  children,
}: {
  id: string;
  tip: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const tipRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [kind, setKind] = useState<'auto' | 'hint'>('auto');
  useEffect(() => {
    if (supportsHint() && !isOpen(tipRef.current)) setKind('hint');
  }, []);
  const show = () => {
    const tip = tipRef.current;
    if (!tip || isOpen(tip)) return;
    try {
      tip.showPopover();
    } catch {}
  };
  const hide = () => {
    try {
      tipRef.current?.hidePopover();
    } catch {}
  };
  // The wrapper scopes one shared anchor name (info.css), so a page with
  // dozens of tooltips carries no per-tooltip anchor styles.
  return (
    <span className="tip-wrap">
      <button
        ref={triggerRef}
        type="button"
        className={className ? `tip-btn ${className}` : 'tip-btn'}
        popoverTarget={id}
        popoverTargetAction="show"
        aria-describedby={id}
        onFocus={show}
        onBlur={hide}
        onMouseEnter={show}
        onMouseLeave={() => {
          if (document.activeElement !== triggerRef.current) hide();
        }}
      >
        {children}
      </button>
      <span
        id={id}
        ref={tipRef}
        role="tooltip"
        popover={kind}
        className="tip-pop"
      >
        {tip}
      </span>
    </span>
  );
}
