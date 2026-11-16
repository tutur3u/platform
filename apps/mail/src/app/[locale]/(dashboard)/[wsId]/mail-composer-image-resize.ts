export const MAIL_IMAGE_MIN_WIDTH = 48;
export const MAIL_IMAGE_KEY_STEP = 10;
export const MAIL_IMAGE_KEY_STEP_LARGE = 50;

export type MailImageCorner = 'nw' | 'ne' | 'sw' | 'se';

const CORNERS: readonly MailImageCorner[] = ['nw', 'ne', 'sw', 'se'];
// The south-east handle is the single keyboard-focusable slider; the others
// are pointer-only so the image adds one tab stop, not four.
const KEYBOARD_CORNER: MailImageCorner = 'se';

const HANDLE_POSITION: Record<MailImageCorner, string> = {
  nw: '-top-1.5 -left-1.5 cursor-nwse-resize',
  ne: '-top-1.5 -right-1.5 cursor-nesw-resize',
  sw: '-bottom-1.5 -left-1.5 cursor-nesw-resize',
  se: '-bottom-1.5 -right-1.5 cursor-nwse-resize',
};

export interface MailImageResizeLabels {
  /** Accessible name of the resize slider. */
  label: string;
  /** Human readable value, for example "240 pixels wide". */
  value: (width: number) => string;
}

/** Clamp to [min, max]; a container narrower than the minimum yields the minimum. */
export function clampMailImageWidth(width: number, max: number) {
  const upper = Math.max(MAIL_IMAGE_MIN_WIDTH, Math.floor(max));
  return Math.min(upper, Math.max(MAIL_IMAGE_MIN_WIDTH, Math.round(width)));
}

/**
 * Locked-aspect width for a corner drag. The pointer delta along the dominant
 * axis wins, so dragging a corner diagonally behaves predictably.
 */
export function resizedMailImageWidth({
  aspect,
  corner,
  dx,
  dy,
  max,
  startWidth,
}: {
  aspect: number;
  corner: MailImageCorner;
  dx: number;
  dy: number;
  max: number;
  startWidth: number;
}) {
  const horizontal = corner.endsWith('e') ? dx : -dx;
  const vertical = (corner.startsWith('s') ? dy : -dy) * aspect;
  const delta =
    Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical;
  return clampMailImageWidth(startWidth + delta, max);
}

/** Next width for a slider key, or null when the key is not handled. */
export function keyboardMailImageWidth(
  key: string,
  current: number,
  max: number,
  large = false
) {
  const step = large ? MAIL_IMAGE_KEY_STEP_LARGE : MAIL_IMAGE_KEY_STEP;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return clampMailImageWidth(current + step, max);
    case 'ArrowLeft':
    case 'ArrowDown':
      return clampMailImageWidth(current - step, max);
    case 'Home':
      return clampMailImageWidth(MAIL_IMAGE_MIN_WIDTH, max);
    case 'End':
      return clampMailImageWidth(max, max);
    default:
      return null;
  }
}

/** Content width of the editor that holds the image. */
export function mailImageMaxWidth(element: HTMLElement) {
  const root = element.closest<HTMLElement>('.ProseMirror');
  if (!root) return element.getBoundingClientRect().width;
  const style = getComputedStyle(root);
  const padding =
    (Number.parseFloat(style.paddingLeft) || 0) +
    (Number.parseFloat(style.paddingRight) || 0);
  return Math.max(MAIL_IMAGE_MIN_WIDTH, Math.floor(root.clientWidth - padding));
}

/**
 * Lay out the wrapper and image for a stored width. The wrapper carries the
 * size so percentage widths resolve against the editor, not a shrink-wrapped
 * box; the image always fills it.
 */
export function applyMailImageLayout(
  wrapper: HTMLElement,
  image: HTMLImageElement,
  width: string | null
) {
  const size = !width ? '' : width.endsWith('%') ? width : `${width}px`;
  wrapper.style.width = size;
  wrapper.style.maxWidth = '100%';
  image.style.display = 'block';
  image.style.maxWidth = '100%';
  if (size) image.style.width = '100%';
}

export interface MailImageResizeController {
  /** Width in px while a drag is active, otherwise null. */
  readonly preview: number | null;
  /** Whether the event came from a resize handle (ProseMirror must ignore it). */
  owns(target: EventTarget | null): boolean;
  /** Abort any drag and remove every listener. */
  destroy(): void;
}

interface Drag {
  aspect: number;
  corner: MailImageCorner;
  handle: HTMLElement;
  max: number;
  pointerId: number;
  startWidth: number;
  startX: number;
  startY: number;
  width: number;
}

/**
 * Add four corner handles to an image wrapper. Dragging previews the size in
 * the DOM only; a single `commit(width)` runs when the drag ends, so no
 * transaction is dispatched while the pointer moves.
 */
export function attachMailImageResize({
  commit,
  image,
  labels,
  restore,
  wrapper,
}: {
  commit: (width: number) => void;
  image: HTMLImageElement;
  labels: () => MailImageResizeLabels;
  /** Re-render the stored width, discarding any drag preview. */
  restore: () => void;
  wrapper: HTMLElement;
}): MailImageResizeController {
  const listeners = new AbortController();
  const { signal } = listeners;
  let drag: Drag | null = null;

  const currentWidth = () => Math.round(wrapper.getBoundingClientRect().width);

  const syncSlider = (handle: HTMLElement) => {
    const max = mailImageMaxWidth(wrapper);
    const width = clampMailImageWidth(currentWidth(), max);
    handle.setAttribute('aria-valuemax', String(max));
    handle.setAttribute('aria-valuenow', String(width));
    handle.setAttribute('aria-valuetext', labels().value(width));
  };

  const finish = (apply: boolean) => {
    const active = drag;
    if (!active) return;
    drag = null;
    delete wrapper.dataset.resizing;
    active.handle.removeEventListener('pointermove', onMove);
    active.handle.removeEventListener('pointerup', onUp);
    active.handle.removeEventListener('pointercancel', onCancel);
    active.handle.removeEventListener('lostpointercapture', onCancel);
    document.removeEventListener('keydown', onEscape);
    try {
      active.handle.releasePointerCapture(active.pointerId);
    } catch {
      // Capture was already released with the pointer.
    }
    if (apply && active.width !== Math.round(active.startWidth)) {
      commit(active.width);
    } else {
      restore();
    }
  };

  function onMove(event: PointerEvent) {
    const active = drag;
    if (!active || event.pointerId !== active.pointerId) return;
    active.width = resizedMailImageWidth({
      aspect: active.aspect,
      corner: active.corner,
      dx: event.clientX - active.startX,
      dy: event.clientY - active.startY,
      max: active.max,
      startWidth: active.startWidth,
    });
    wrapper.style.width = `${active.width}px`;
    image.style.width = '100%';
  }
  function onUp(event: PointerEvent) {
    if (event.pointerId === drag?.pointerId) finish(true);
  }
  function onCancel(event: Event) {
    if (!(event instanceof PointerEvent) || event.pointerId === drag?.pointerId)
      finish(false);
  }
  function onEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    finish(false);
  }

  const start = (corner: MailImageCorner, handle: HTMLElement) => {
    handle.addEventListener(
      'pointerdown',
      (event: PointerEvent) => {
        if (drag || (event.pointerType === 'mouse' && event.button !== 0))
          return;
        event.preventDefault();
        event.stopPropagation();
        const rect = wrapper.getBoundingClientRect();
        const width = Math.round(rect.width);
        drag = {
          aspect: rect.height > 0 ? rect.width / rect.height : 1,
          corner,
          handle,
          max: mailImageMaxWidth(wrapper),
          pointerId: event.pointerId,
          startWidth: rect.width,
          startX: event.clientX,
          startY: event.clientY,
          width,
        };
        wrapper.dataset.resizing = 'true';
        try {
          handle.setPointerCapture(event.pointerId);
        } catch {
          // Synthetic pointers cannot be captured; moves still reach the handle.
        }
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onCancel);
        handle.addEventListener('lostpointercapture', onCancel);
        document.addEventListener('keydown', onEscape);
      },
      { signal }
    );
  };

  for (const corner of CORNERS) {
    const handle = document.createElement('span');
    handle.dataset.mailImageHandle = corner;
    handle.className = `absolute z-10 hidden size-3 touch-none rounded-sm border border-background bg-primary group-[.ProseMirror-selectednode]:block ${HANDLE_POSITION[corner]}`;
    // Handles never start a native drag of the (draggable) image.
    handle.addEventListener('mousedown', (event) => event.preventDefault(), {
      signal,
    });
    if (corner === KEYBOARD_CORNER) {
      handle.setAttribute('role', 'slider');
      handle.setAttribute('aria-orientation', 'horizontal');
      handle.setAttribute('aria-valuemin', String(MAIL_IMAGE_MIN_WIDTH));
      handle.tabIndex = 0;
      handle.classList.add(
        'focus-visible:outline',
        'focus-visible:outline-2',
        'focus-visible:outline-offset-2',
        'focus-visible:outline-ring'
      );
      const refreshLabel = () => {
        handle.setAttribute('aria-label', labels().label);
        syncSlider(handle);
      };
      refreshLabel();
      handle.addEventListener('focus', refreshLabel, { signal });
      handle.addEventListener(
        'keydown',
        (event) => {
          if (drag) return;
          const max = mailImageMaxWidth(wrapper);
          const next = keyboardMailImageWidth(
            event.key,
            clampMailImageWidth(currentWidth(), max),
            max,
            event.shiftKey
          );
          if (next === null) return;
          event.preventDefault();
          event.stopPropagation();
          commit(next);
          syncSlider(handle);
        },
        { signal }
      );
    } else {
      handle.tabIndex = -1;
      handle.setAttribute('aria-hidden', 'true');
    }
    start(corner, handle);
    wrapper.append(handle);
  }

  // The wrapper is draggable for node moves; a resize must never start one.
  wrapper.addEventListener(
    'dragstart',
    (event) => {
      if (drag) event.preventDefault();
    },
    { signal }
  );

  return {
    get preview() {
      return drag ? drag.width : null;
    },
    owns: (target) =>
      target instanceof Element &&
      target.closest('[data-mail-image-handle]') !== null,
    destroy() {
      finish(false);
      listeners.abort();
    },
  };
}
