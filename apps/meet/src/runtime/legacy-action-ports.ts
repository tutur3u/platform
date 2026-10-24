import { legacyActionSchemas } from './legacy-action-contracts';

export type LegacyActionSupplier =
  typeof import('./legacy-plan-supplier.server');

export function createLegacyActionPorts({
  load,
  actor,
}: {
  load: () => Promise<LegacyActionSupplier>;
  actor: () => Promise<{ id: string } | null>;
}) {
  const unsigned = async (error: string) =>
    (await actor()) ? null : { error };
  return {
    async guestLogin(raw: unknown) {
      const args = legacyActionSchemas.guestLogin.parse(raw);
      return (await load()).guestLogin(...args);
    },
    async togglePlanLock(raw: unknown) {
      const args = legacyActionSchemas.togglePlanLock.parse(raw);
      const denied = await unsigned('Unauthorized');
      return denied ?? (await load()).togglePlanLock(...args);
    },
    async removeUserFromPlan(raw: unknown) {
      const args = legacyActionSchemas.removeUserFromPlan.parse(raw);
      const denied = await unsigned('Not authenticated');
      return denied ?? (await load()).removeUserFromPlan(...args);
    },
    async createPoll(raw: unknown) {
      const args = legacyActionSchemas.createPoll.parse(raw);
      const denied = await unsigned('Unauthorized');
      return denied ?? (await load()).createPoll(...args);
    },
    async deletePoll(raw: unknown) {
      const args = legacyActionSchemas.deletePoll.parse(raw);
      const denied = await unsigned('Authentication required');
      return denied ?? (await load()).deletePoll(...args);
    },
    async addPollOption(raw: unknown) {
      const args = legacyActionSchemas.addPollOption.parse(raw);
      const participant = args[1];
      if (
        participant.userType === 'GUEST' &&
        (!participant.guestId || !participant.guestSession)
      )
        return { error: 'Unauthorized' };
      const denied =
        participant.userType === 'PLATFORM'
          ? await unsigned('Unauthorized')
          : null;
      return denied ?? (await load()).addPollOption(...args);
    },
    async deletePollOption(raw: unknown) {
      const args = legacyActionSchemas.deletePollOption.parse(raw);
      if (args[2].userType !== 'PLATFORM') return { error: 'Unauthorized' };
      const denied = await unsigned('Unauthorized');
      return denied ?? (await load()).deletePollOption(...args);
    },
    async submitVote(raw: unknown) {
      const args = legacyActionSchemas.submitVote.parse(raw);
      const participant = args[1];
      if (
        participant.userType === 'GUEST' &&
        (!participant.guestId || !participant.guestSession)
      )
        return { error: 'Unauthorized' };
      const denied =
        participant.userType === 'PLATFORM'
          ? await unsigned('Unauthorized')
          : null;
      return denied ?? (await load()).submitVote(...args);
    },
    async toggleWherePoll(raw: unknown) {
      const args = legacyActionSchemas.toggleWherePoll.parse(raw);
      const denied = await unsigned('Unauthorized');
      return denied ?? (await load()).toggleWherePoll(...args);
    },
  };
}
