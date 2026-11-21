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
  const requests = loginRequests(state, new Date(now));
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
        <SectionMessage>{t('access.empty')}</SectionMessage>
      )}
    </Section>
  );
}
