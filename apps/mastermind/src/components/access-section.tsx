import type { FleetState } from '../fleet/contract';
import { loginRequests } from '../fleet/model';
import { useI18n } from '../i18n';
import { LoginCard } from './login-card';
import { Section, SectionMessage } from './section';

export function AccessSection({
  state,
  now,
  interactive,
}: {
  state: FleetState;
  now: number;
  interactive: boolean;
}) {
  const { t } = useI18n();
  // Open requests are answered from Needs you in the Inbox; one card per
  // request keeps a single answer state. This section keeps the rest.
  const requests = loginRequests(state, new Date(now)).filter(
    (request) => request.state !== 'waiting' && request.state !== 'approved'
  );
  const label = (id?: string) =>
    state.machines.find((m) => m.id === id)?.label ?? id;
  return (
    <Section id="access" title={t('nav.access')} note={t('access.note')}>
      {requests.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {requests.map((request) => (
            <LoginCard
              key={request.decision.id}
              decision={request.decision}
              login={request.login}
              state={request.state}
              machine={label(request.login.machineId)}
              now={now}
              interactive={interactive}
            />
          ))}
        </div>
      ) : (
        <SectionMessage>{t('access.inInbox')}</SectionMessage>
      )}
    </Section>
  );
}
