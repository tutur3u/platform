'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSsoClientDetail,
  setSsoAssignment,
} from '@tuturuuu/internal-api/sso';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { SsoMutationError } from './mutation-error';
import { PublicSetup } from './public-setup';

export const ssoKey = (wsId: string) => ['workspace-sso-management', wsId];
export function ClientDetails({
  wsId,
  clientId,
}: {
  wsId: string;
  clientId: string;
}) {
  const t = useTranslations('workspace-sso');
  const cache = useQueryClient();
  const detail = useQuery({
    queryKey: [...ssoKey(wsId), clientId],
    queryFn: () => getSsoClientDetail(wsId, clientId),
    retry: false,
  });
  const assignment = useMutation({
    mutationFn: (input: {
      userId: string;
      active: boolean;
      expectedRevision: number;
    }) => setSsoAssignment(wsId, clientId, input),
    onSuccess: () => cache.invalidateQueries({ queryKey: ssoKey(wsId) }),
  });
  if (detail.isPending) return <p role="status">{t('loading')}</p>;
  if (detail.isError)
    return (
      <div role="alert">
        {t('loadError')}{' '}
        <Button variant="outline" onClick={() => detail.refetch()}>
          {t('refresh')}
        </Button>
      </div>
    );
  return (
    <div className="space-y-6">
      <PublicSetup detail={detail.data} />
      <section className="space-y-3" aria-labelledby="sso-assignments">
        <h2 id="sso-assignments" className="font-semibold">
          {t('assignments')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('assignmentsHelp')}</p>
        <SsoMutationError error={assignment.error} />
        {detail.data.members.length === 0 && <p>{t('noMembers')}</p>}
        <ul className="space-y-2">
          {detail.data.members.map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div>
                <p>{member.displayName ?? member.userId}</p>
                <p className="text-muted-foreground text-sm">
                  {t(member.active ? 'assigned' : 'unassigned')}
                </p>
              </div>
              <Button
                variant="outline"
                aria-label={t(member.active ? 'revokeNamed' : 'assignNamed', {
                  name: member.displayName ?? member.userId,
                })}
                disabled={assignment.isPending || detail.isFetching}
                onClick={() =>
                  assignment.mutate({
                    userId: member.userId,
                    expectedRevision: member.revision,
                    active: !member.active,
                  })
                }
              >
                {t(member.active ? 'revoke' : 'assign')}
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3" aria-labelledby="sso-audit">
        <h2 id="sso-audit" className="font-semibold">
          {t('audit')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('auditHelp')}</p>
        {detail.data.audit.length === 0 ? (
          <p>{t('noAudit')}</p>
        ) : (
          <ul className="space-y-2">
            {detail.data.audit.map((event) => (
              <li key={event.id} className="rounded-md border p-3 text-sm">
                <p>{t(`events.${event.eventType.replaceAll('.', '_')}`)}</p>
                <time dateTime={event.createdAt}>{event.createdAt}</time>
                <p>{t('revision', { revision: event.revision })}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
