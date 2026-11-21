import { useLocation } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { MailWorkspaceSkeleton } from './mail-workspace-skeleton';
import { AppProviders } from './providers';

/**
 * Shown while a page model loads on a client navigation that outlasts
 * `pendingMs`. The first document load never renders it: the server resolves
 * the model before it sends HTML.
 */
export function MailPendingPage(): ReactElement {
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <AppProviders
      locale={pathname.startsWith('/vi') ? 'vi' : 'en'}
      showVersionBadge={false}
      params={{}}
    >
      <MailWorkspaceSkeleton />
    </AppProviders>
  );
}

export const mailPendingOptions = {
  pendingComponent: MailPendingPage,
  pendingMs: 1000,
  pendingMinMs: 300,
};
