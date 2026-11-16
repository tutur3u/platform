import type { MailImageNodeState } from './mail-composer-image-nodes';

export interface MailImageUploadLabels {
  /** Accessible name of an item, for example "photo.jpg, uploading". */
  describe: (name: string, state: MailImageNodeState) => string;
  failed: string;
  /** Accessible name of an action, for example "Try again: photo.jpg". */
  named: (action: string, name: string) => string;
  queued: string;
  remove: string;
  retry: string;
  uploading: string;
}

export interface MailImageUploadActions {
  remove: (id: string) => void;
  retry: (id: string) => void;
}

export interface MailImageUploadView {
  destroy: () => void;
  /** Whether the event belongs to the overlay (ProseMirror must ignore it). */
  owns: (target: EventTarget | null) => boolean;
  /** Sync the overlay with the node's upload attributes. */
  update: (attrs: Record<string, unknown>) => void;
}

const ICONS = {
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  retry:
    '<path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.9 1 6.7 2.7L21 8"/><path d="M21 3v5h-5"/>',
  spin: '<path d="M21 12a9 9 0 1 1-6.2-8.56"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
} as const;

const COMPACT_WIDTH = 200;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = ''
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function icon(name: keyof typeof ICONS, className = '') {
  const holder = element('span', `inline-flex shrink-0 ${className}`);
  holder.setAttribute('aria-hidden', 'true');
  // Static markup from the table above; no external data reaches innerHTML.
  holder.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return holder;
}

function prefersReducedMotion() {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Placeholder chrome for an image that is not on the server yet: status badge,
 * an indeterminate hairline (fetch reports no upload bytes, so it never
 * pretends to know a percentage), and Retry/Remove for a failed upload. It is
 * plain DOM driven by node attributes, so progress never re-renders React.
 */
export function attachMailImageUploadView({
  actions,
  image,
  labels,
  wrapper,
}: {
  actions: () => MailImageUploadActions;
  image: HTMLImageElement;
  labels: () => MailImageUploadLabels;
  wrapper: HTMLElement;
}): MailImageUploadView {
  const listeners = new AbortController();
  const { signal } = listeners;
  let id: string | null = null;
  let state: MailImageNodeState | null = null;
  let animation: Animation | null = null;

  const badge = element(
    'span',
    'pointer-events-none absolute top-2 left-2 z-10 hidden h-6 items-center gap-1.5 rounded-full bg-background/90 px-2 font-semibold text-foreground text-xs leading-none'
  );
  const badgeText = element('span');
  badge.append(badgeText);

  const bar = element(
    'span',
    'pointer-events-none absolute inset-x-0 bottom-0 z-10 hidden h-1 overflow-hidden rounded-b-lg bg-foreground/15'
  );
  bar.setAttribute('aria-hidden', 'true');
  const slider = element(
    'i',
    'absolute inset-y-0 left-0 block w-[40%] bg-dynamic-blue'
  );
  bar.append(slider);

  const panel = element(
    'span',
    'absolute inset-0 z-10 hidden items-center justify-center gap-2 p-2'
  );
  const buttonClass =
    'relative inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2.5 font-semibold text-foreground text-sm hover:bg-accent pointer-coarse:h-11 pointer-coarse:min-w-11';
  const retryButton = element(
    'button',
    `${buttonClass} !border-primary !bg-primary !text-primary-foreground hover:!bg-primary/90`
  );
  retryButton.type = 'button';
  retryButton.dataset.mailUploadRetry = '';
  const retryText = element('span');
  retryButton.append(icon('retry'), retryText);
  const removeButton = element('button', buttonClass);
  removeButton.type = 'button';
  removeButton.dataset.mailUploadRemove = '';
  const removeText = element('span');
  removeButton.append(icon('x'), removeText);
  panel.append(retryButton, removeButton);

  const act = (run: (id: string) => void) => (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if (id) run(id);
  };
  retryButton.addEventListener(
    'click',
    act((value) => actions().retry(value)),
    {
      signal,
    }
  );
  removeButton.addEventListener(
    'click',
    act((value) => actions().remove(value)),
    { signal }
  );
  // A failed placeholder is one tab stop: Enter retries, Delete removes.
  wrapper.addEventListener(
    'keydown',
    (event) => {
      if (event.target !== wrapper || state !== 'failed' || !id) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        actions().retry(id);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        actions().remove(id);
      }
    },
    { signal }
  );
  wrapper.append(badge, bar, panel);

  const stopAnimation = () => {
    animation?.cancel();
    animation = null;
  };

  return {
    destroy() {
      stopAnimation();
      listeners.abort();
    },
    owns: (target) =>
      target instanceof Node &&
      (panel.contains(target) || (target === wrapper && state === 'failed')),
    update(attrs) {
      id = typeof attrs.uploadId === 'string' ? attrs.uploadId : null;
      const next = (attrs.uploadState as MailImageNodeState | null) ?? null;
      state = next;
      const copy = labels();
      const name = String(attrs.uploadName ?? '');
      const pending = next === 'queued' || next === 'uploading';

      if (next) wrapper.dataset.uploadState = next;
      else delete wrapper.dataset.uploadState;
      wrapper.style.display = next === 'removing' ? 'none' : '';
      if (next && next !== 'removing') {
        wrapper.setAttribute('role', 'group');
        wrapper.setAttribute('aria-label', copy.describe(name, next));
        wrapper.tabIndex = next === 'failed' ? 0 : -1;
      } else {
        wrapper.removeAttribute('role');
        wrapper.removeAttribute('aria-label');
        wrapper.removeAttribute('tabindex');
      }
      if (next === 'uploading') wrapper.setAttribute('aria-busy', 'true');
      else wrapper.removeAttribute('aria-busy');

      image.style.opacity = pending ? '0.55' : next === 'failed' ? '0.35' : '';
      image.style.filter = next === 'failed' ? 'grayscale(1)' : '';
      image.style.borderRadius = next ? '8px' : '';
      for (const handle of wrapper.querySelectorAll<HTMLElement>(
        '[data-mail-image-handle]'
      ))
        handle.style.display = next ? 'none' : '';

      const showBadge =
        next === 'queued' || next === 'uploading' || next === 'failed';
      badge.style.display = showBadge ? 'inline-flex' : 'none';
      badge.classList.toggle('text-dynamic-red', next === 'failed');
      badge.replaceChildren(
        icon(
          next === 'failed' ? 'alert' : next === 'queued' ? 'clock' : 'spin',
          next === 'uploading' && !prefersReducedMotion() ? 'animate-spin' : ''
        ),
        badgeText
      );
      badgeText.textContent =
        next === 'failed'
          ? copy.failed
          : next === 'queued'
            ? copy.queued
            : copy.uploading;

      bar.style.display = pending ? 'block' : 'none';
      if (next === 'uploading' && !animation) {
        if (typeof slider.animate === 'function' && !prefersReducedMotion())
          animation = slider.animate(
            [
              { transform: 'translateX(-100%)' },
              { transform: 'translateX(250%)' },
            ],
            { duration: 1200, easing: 'ease-in-out', iterations: Infinity }
          );
      } else if (next !== 'uploading') {
        stopAnimation();
      }

      panel.style.display = next === 'failed' ? 'flex' : 'none';
      if (next === 'failed') {
        const rect = wrapper.getBoundingClientRect().width;
        const compact = rect > 0 && rect < COMPACT_WIDTH;
        retryText.textContent = compact ? '' : copy.retry;
        removeText.textContent = compact ? '' : copy.remove;
        retryButton.setAttribute('aria-label', copy.named(copy.retry, name));
        removeButton.setAttribute('aria-label', copy.named(copy.remove, name));
      }
    },
  };
}
