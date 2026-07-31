import type { ReactNode } from 'react';
import { StudioPageHeader } from './page-header';

/**
 * Every AI Studio section renders through this shell so the header, rhythm and
 * bottom gutter stay identical across the app. Horizontal padding comes from
 * the sidebar structure, never from the page.
 */
export function StudioPageShell({
  actions,
  badge,
  children,
  description,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  badge?: string;
  children: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  title: string;
}) {
  return (
    <div className="space-y-5 pb-12">
      <StudioPageHeader
        actions={actions}
        badge={badge}
        description={description}
        eyebrow={eyebrow}
        title={title}
      />
      {children}
    </div>
  );
}
