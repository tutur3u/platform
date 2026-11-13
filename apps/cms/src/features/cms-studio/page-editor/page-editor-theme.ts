import type { CSSProperties } from 'react';

/**
 * IEEAI site tokens (ieeai.net/ai-handbook), scoped to the editor root as
 * CSS custom properties so the canvas reads like the live site inside the
 * Tuturuuu app chrome. Nothing here leaks into the rest of the CMS.
 */
export const IEEAI_TOKENS = {
  '--ieeai-navy': '#000054',
  '--ieeai-navy-hover': '#2a3a8a',
  '--ieeai-yellow': '#fac800',
  '--ieeai-yellow-soft': '#fff5c5',
  '--ieeai-ink': '#1e293b',
  '--ieeai-text': '#334155',
  '--ieeai-muted': '#475569',
  '--ieeai-subtle': '#64748b',
  '--ieeai-border': '#e2e8f0',
  '--ieeai-surface': '#f8fafc',
  '--ieeai-surface-2': '#f1f5f9',
  '--ieeai-display': 'Nunito, ui-rounded, system-ui, sans-serif',
  '--ieeai-body': 'Inter, system-ui, sans-serif',
} as const;

export const ieeaiThemeStyle = IEEAI_TOKENS as unknown as CSSProperties;

/** Shared class strings, so every part uses the same shapes. */
export const ieeai = {
  card: 'rounded-[12px] border border-[var(--ieeai-border)] bg-white',
  eyebrow:
    'font-[family-name:var(--ieeai-body)] text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ieeai-subtle)]',
  heading:
    'font-[family-name:var(--ieeai-display)] font-extrabold tracking-[-0.01em] text-[var(--ieeai-navy)]',
  focus:
    'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--ieeai-navy)]',
  pillPrimary:
    'inline-flex h-10 items-center gap-2 rounded-full bg-[var(--ieeai-yellow)] px-5 font-[family-name:var(--ieeai-display)] font-bold text-[var(--ieeai-navy)] shadow-sm transition-colors hover:bg-[#ffd42e] disabled:opacity-60',
  pillSecondary:
    'inline-flex h-10 items-center gap-2 rounded-full border-2 border-[var(--ieeai-navy)] bg-white px-4 font-[family-name:var(--ieeai-display)] font-bold text-[var(--ieeai-navy)] transition-colors hover:bg-[var(--ieeai-surface-2)] disabled:opacity-60',
  iconButton:
    'inline-flex size-8 items-center justify-center rounded-full text-[var(--ieeai-muted)] transition-colors hover:bg-[var(--ieeai-surface-2)] hover:text-[var(--ieeai-navy)] disabled:pointer-events-none disabled:opacity-40',
} as const;
