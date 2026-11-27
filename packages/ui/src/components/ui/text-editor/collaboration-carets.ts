type CaretUser = { id?: unknown; name?: unknown; color?: unknown };
function identity(user: CaretUser) {
  return typeof user.id === 'string' ? user.id.slice(0, 100) : '';
}
function color(user: CaretUser) {
  return typeof user.color === 'string' && /^#[0-9a-f]{6}$/i.test(user.color)
    ? user.color
    : 'var(--primary)';
}
const TOP_LABEL_CLEARANCE_PX = 4;
const FALLBACK_LABEL_HEIGHT_PX = 18;
// Sticky chrome (the editor toolbar) sits over the top of a scroll container, so
// a label above a caret just below it would be hidden behind that chrome.
const STICKY_SCAN_DEPTH = 3;

function stickyChromeBottom(scroller: HTMLElement, top: number): number {
  let bottom = top;
  const scan = (parent: HTMLElement, depth: number) => {
    for (const child of parent.children) {
      if (!(child instanceof HTMLElement)) continue;
      const rect = child.getBoundingClientRect();
      if (
        getComputedStyle(child).position === 'sticky' &&
        rect.top <= top + 1 &&
        rect.bottom > bottom
      ) {
        bottom = rect.bottom;
      }
      if (depth < STICKY_SCAN_DEPTH) scan(child, depth + 1);
    }
  };
  scan(scroller, 1);
  return bottom;
}

function findTopClipEdge(caret: HTMLElement): number | null {
  const editorRoot = caret.closest<HTMLElement>('.ProseMirror');
  let top: number | null = editorRoot
    ? editorRoot.getBoundingClientRect().top
    : null;
  let current: HTMLElement | null = caret.parentElement;
  while (current && current !== document.body) {
    const overflowY = getComputedStyle(current).overflowY;
    if (
      overflowY === 'auto' ||
      overflowY === 'scroll' ||
      overflowY === 'hidden' ||
      overflowY === 'clip'
    ) {
      const rect = current.getBoundingClientRect();
      if (rect.height > 0) {
        const edge = Math.max(rect.top, stickyChromeBottom(current, rect.top));
        top = top === null ? edge : Math.max(top, edge);
      }
    }
    current = current.parentElement;
  }
  return top;
}

/**
 * Places a remote caret's name pill below the caret whenever placing it above
 * would clip against the editor toolbar or scroll container top edge.
 */
export function positionCollaborationCaretLabel(
  caret: HTMLElement,
  label: HTMLElement
) {
  if (!caret.isConnected) return;
  const caretRect = caret.getBoundingClientRect();
  const labelHeight =
    label.getBoundingClientRect().height || FALLBACK_LABEL_HEIGHT_PX;
  const clipTop = findTopClipEdge(caret);
  let flipBelow = false;
  if (caretRect.height > 0 && clipTop !== null) {
    flipBelow = caretRect.top - clipTop < labelHeight + TOP_LABEL_CLEARANCE_PX;
  } else {
    const editorRoot = caret.closest<HTMLElement>('.ProseMirror');
    flipBelow = Boolean(editorRoot?.firstElementChild?.contains(caret));
  }
  if (flipBelow) {
    label.style.top = 'calc(100% + 2px)';
    label.style.borderRadius = '0 3px 3px 3px';
    label.dataset.placement = 'bottom';
  } else {
    label.style.top = '-1.4em';
    label.style.borderRadius = '3px 3px 3px 0';
    label.dataset.placement = 'top';
  }
}

export function updateCollaborationCaretPlacements(root: HTMLElement) {
  for (const caret of root.querySelectorAll<HTMLElement>(
    '.collaboration-carets__caret'
  )) {
    const label = caret.querySelector<HTMLElement>(
      '.collaboration-carets__label'
    );
    if (label) positionCollaborationCaretLabel(caret, label);
  }
}

/** Self-contained caret styling works in every editor surface, including Meet. */
export function renderCollaborationCaret(user: CaretUser) {
  const caret = document.createElement('span');
  caret.className = 'collaboration-carets__caret';
  caret.dataset.userId = identity(user);
  Object.assign(caret.style, {
    borderLeft: `2px solid ${color(user)}`,
    position: 'relative',
    marginLeft: '-1px',
    pointerEvents: 'none',
  });
  const label = document.createElement('span');
  label.className = 'collaboration-carets__label';
  label.dataset.userId = identity(user);
  label.dataset.placement = 'top';
  label.textContent =
    typeof user.name === 'string' ? user.name.slice(0, 100) : '';
  Object.assign(label.style, {
    position: 'absolute',
    top: '-1.4em',
    left: '-2px',
    zIndex: '20',
    padding: '1px 4px',
    borderRadius: '3px 3px 3px 0',
    backgroundColor: color(user),
    color: 'var(--primary-foreground)',
    fontSize: '11px',
    lineHeight: '1.2',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  });
  caret.append(label);
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => positionCollaborationCaretLabel(caret, label));
  }
  return caret;
}
export function renderCollaborationSelection(user: CaretUser) {
  return {
    nodeName: 'span',
    class: 'collaboration-carets__selection',
    'data-user-id': identity(user),
    style: `background-color: color-mix(in srgb, ${color(user)} 24%, transparent);`,
  };
}
export function scrollToCollaborationCaret(root: HTMLElement, userId: string) {
  const caret = [
    ...root.querySelectorAll<HTMLElement>('.collaboration-carets__caret'),
  ].find((element) => element.dataset.userId === userId);
  caret?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return !!caret;
}
