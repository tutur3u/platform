'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from '@tuturuuu/icons';
import { searchWorkspacePeople } from '@tuturuuu/internal-api/people';
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import { useLocale, useTranslations } from 'next-intl';
import { useDebounce } from 'use-debounce';

const contactsOrigin = resolveInternalAppUrl({
  appName: 'contacts',
  candidates: [process.env.NEXT_PUBLIC_CONTACTS_APP_URL],
  fallback:
    process.env.NODE_ENV === 'production'
      ? 'https://contacts.tuturuuu.com'
      : getLocalInternalAppUrl('contacts', 'http://localhost:7827'),
});

export function TaskContactResults({
  workspaceId,
  query,
  open,
}: {
  workspaceId?: string;
  query: string;
  open: boolean;
}) {
  const search = query.trim();
  if (!open || !workspaceId || search.length < 2 || search.length > 100)
    return null;

  return <ContactResults workspaceId={workspaceId} query={search} />;
}

function ContactResults({
  workspaceId,
  query,
}: {
  workspaceId: string;
  query: string;
}) {
  const t = useTranslations('common.task_contacts');
  const locale = useLocale();
  const [debouncedQuery] = useDebounce(query, 200);
  const results = useQuery({
    queryKey: ['task-contact-search', workspaceId, debouncedQuery],
    queryFn: () =>
      searchWorkspacePeople(workspaceId, { query: debouncedQuery, limit: 10 }),
    enabled: query === debouncedQuery,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  if (query !== debouncedQuery || results.isPending) return null;
  if (results.isError)
    return (
      <p role="status" className="px-3 py-2 text-muted-foreground text-xs">
        {t('unavailable')}
      </p>
    );

  const contacts = results.data.data.filter(
    (person) => person.kind === 'contact'
  );
  if (!contacts.length) return null;

  return (
    <section aria-label={t('heading')} className="space-y-1 border-t pt-2">
      <p className="px-3 font-medium text-muted-foreground text-xs">
        {t('heading')}
      </p>
      {contacts.map((contact) => {
        const name = contact.displayName || contact.email || t('unnamed');
        return (
          <a
            key={contact.id}
            href={`${contactsOrigin}/${encodeURIComponent(locale)}/${encodeURIComponent(workspaceId)}/users/database/${encodeURIComponent(contact.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('open', { name })}
            className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted focus-visible:outline focus-visible:outline-ring"
          >
            <span className="min-w-0">
              <span className="block truncate">{name}</span>
              {contact.displayName && contact.email && (
                <span className="block truncate text-muted-foreground text-xs">
                  {contact.email}
                </span>
              )}
            </span>
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          </a>
        );
      })}
    </section>
  );
}
