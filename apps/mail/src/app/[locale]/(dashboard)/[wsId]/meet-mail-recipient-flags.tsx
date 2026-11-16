'use client';
import { useQueries } from '@tanstack/react-query';
import { searchWorkspacePeople } from '@tuturuuu/internal-api/people';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
export function MeetMailRecipientFlags({
  actorId,
  workspaceId,
  id,
  recipients,
}: {
  actorId: string;
  workspaceId: string;
  id: string;
  recipients: string[];
}) {
  const t = useTranslations('mail.meet_handoff');
  const results = useQueries({
    queries: recipients.map((email) => ({
      queryKey: ['mail-handoff-member', actorId, workspaceId, id, email],
      queryFn: () =>
        searchWorkspacePeople(workspaceId, { query: email, limit: 10 }),
      enabled: email.length >= 2 && email.length <= 100,
      retry: false as const,
      gcTime: 0,
      staleTime: 0,
      refetchOnWindowFocus: false as const,
      refetchOnReconnect: false as const,
    })),
  });
  return (
    <ul>
      {recipients.map((email, index) => {
        const verified =
          results[index]?.isSuccess &&
          !results[index]?.isFetching &&
          results[index]?.data?.data.some(
            (person) =>
              person.kind === 'member' &&
              person.email?.trim().toLowerCase() === email
          );
        return (
          <li key={email} className="flex flex-wrap items-center gap-2">
            <span>{email}</span>
            {!verified && <Badge variant="outline">{t('external')}</Badge>}
          </li>
        );
      })}
    </ul>
  );
}
