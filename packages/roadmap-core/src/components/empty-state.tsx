import type { ReactNode } from 'react';

/**
 * An empty or unknown state: what is missing and why, in plain words. It
 * never shows a figure or a placeholder item. `unknown` marks data the
 * build could not check (as opposed to data that is genuinely empty).
 */
export function EmptyState({
  icon,
  title,
  children,
  tone = 'empty',
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  tone?: 'empty' | 'unknown';
}) {
  return (
    <div className="rm-empty" data-tone={tone}>
      <span className="rm-empty-icon" aria-hidden>
        {icon}
      </span>
      <p className="rm-empty-title">{title}</p>
      <p className="rm-empty-body">{children}</p>
    </div>
  );
}
