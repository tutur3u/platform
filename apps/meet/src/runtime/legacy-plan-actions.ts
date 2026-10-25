import { createServerFn, getRouterInstance } from '@tanstack/react-start';
import { legacyActionSchemas } from './legacy-action-contracts';
import type { LegacyActionSupplier } from './legacy-action-ports';
import { refreshConfirmedAction } from './legacy-action-refresh';

async function visibleResult<T>(result: Promise<T>) {
  return refreshConfirmedAction(await result, async () => {
    if (typeof window === 'undefined') return;
    await (await getRouterInstance()).invalidate();
  });
}

const resetGuestPasswordTransport = createServerFn({ method: 'POST' })
  .validator(legacyActionSchemas.resetGuestPassword)
  .handler(async ({ data }) => {
    const { getLegacyActionPorts } = await import(
      './legacy-action-runtime.server'
    );
    return getLegacyActionPorts().resetGuestPassword(data);
  });

export function resetGuestPassword(
  ...args: Parameters<LegacyActionSupplier['resetGuestPassword']>
) {
  return visibleResult(resetGuestPasswordTransport({ data: args }));
}

const guestLoginTransport = createServerFn({ method: 'POST' })
  .validator(legacyActionSchemas.guestLogin)
  .handler(async ({ data }) => {
    const { getLegacyActionPorts } = await import(
      './legacy-action-runtime.server'
    );
    return getLegacyActionPorts().guestLogin(data);
  });

export function guestLogin(
  ...args: Parameters<LegacyActionSupplier['guestLogin']>
) {
  return visibleResult(guestLoginTransport({ data: args }));
}

const togglePlanLockTransport = createServerFn({ method: 'POST' })
  .validator(legacyActionSchemas.togglePlanLock)
  .handler(async ({ data }) => {
    const { getLegacyActionPorts } = await import(
      './legacy-action-runtime.server'
    );
    return getLegacyActionPorts().togglePlanLock(data);
  });

export function togglePlanLock(
  ...args: Parameters<LegacyActionSupplier['togglePlanLock']>
) {
  return visibleResult(togglePlanLockTransport({ data: args }));
}

const removeUserFromPlanTransport = createServerFn({ method: 'POST' })
  .validator(legacyActionSchemas.removeUserFromPlan)
  .handler(async ({ data }) => {
    const { getLegacyActionPorts } = await import(
      './legacy-action-runtime.server'
    );
    return getLegacyActionPorts().removeUserFromPlan(data);
  });

export function removeUserFromPlan(
  ...args: Parameters<LegacyActionSupplier['removeUserFromPlan']>
) {
  return visibleResult(removeUserFromPlanTransport({ data: args }));
}

const createPollTransport = createServerFn({ method: 'POST' })
  .validator(legacyActionSchemas.createPoll)
  .handler(async ({ data }) => {
    const { getLegacyActionPorts } = await import(
      './legacy-action-runtime.server'
    );
    return getLegacyActionPorts().createPoll(data);
  });

export function createPoll(
  ...args: Parameters<LegacyActionSupplier['createPoll']>
) {
  return visibleResult(createPollTransport({ data: args }));
}

const deletePollTransport = createServerFn({ method: 'POST' })
  .validator(legacyActionSchemas.deletePoll)
  .handler(async ({ data }) => {
    const { getLegacyActionPorts } = await import(
      './legacy-action-runtime.server'
    );
    return getLegacyActionPorts().deletePoll(data);
  });

export function deletePoll(
  ...args: Parameters<LegacyActionSupplier['deletePoll']>
) {
  return visibleResult(deletePollTransport({ data: args }));
}

const addPollOptionTransport = createServerFn({ method: 'POST' })
  .validator(legacyActionSchemas.addPollOption)
  .handler(async ({ data }) => {
    const { getLegacyActionPorts } = await import(
      './legacy-action-runtime.server'
    );
    return getLegacyActionPorts().addPollOption(data);
  });

export function addPollOption(
  ...args: Parameters<LegacyActionSupplier['addPollOption']>
) {
  return visibleResult(addPollOptionTransport({ data: args }));
}

const deletePollOptionTransport = createServerFn({ method: 'POST' })
  .validator(legacyActionSchemas.deletePollOption)
  .handler(async ({ data }) => {
    const { getLegacyActionPorts } = await import(
      './legacy-action-runtime.server'
    );
    return getLegacyActionPorts().deletePollOption(data);
  });

export function deletePollOption(
  ...args: Parameters<LegacyActionSupplier['deletePollOption']>
) {
  return visibleResult(deletePollOptionTransport({ data: args }));
}

const submitVoteTransport = createServerFn({ method: 'POST' })
  .validator(legacyActionSchemas.submitVote)
  .handler(async ({ data }) => {
    const { getLegacyActionPorts } = await import(
      './legacy-action-runtime.server'
    );
    return getLegacyActionPorts().submitVote(data);
  });

export function submitVote(
  ...args: Parameters<LegacyActionSupplier['submitVote']>
) {
  return visibleResult(submitVoteTransport({ data: args }));
}

const toggleWherePollTransport = createServerFn({ method: 'POST' })
  .validator(legacyActionSchemas.toggleWherePoll)
  .handler(async ({ data }) => {
    const { getLegacyActionPorts } = await import(
      './legacy-action-runtime.server'
    );
    return getLegacyActionPorts().toggleWherePoll(data);
  });

export function toggleWherePoll(
  ...args: Parameters<LegacyActionSupplier['toggleWherePoll']>
) {
  return visibleResult(toggleWherePollTransport({ data: args }));
}
