const gitSha = /^(?!0+$)[a-f0-9]{40}$/;
const recipeSha = /^sha256:[a-f0-9]{64}$/;
const appName = /^[a-z][a-z0-9-]{0,62}$/;
const targets = ['production', 'main'];
const eventFields = ['app', 'target', 'sha', 'recipeDigest', 'observedHeadSha'];

export class ShadowInputError extends Error {}

function hasFields(value, fields) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}

function matches(value, pattern) {
  return typeof value === 'string' && pattern.test(value);
}

function parseEvent(event, index) {
  if (
    !hasFields(event, eventFields) ||
    !matches(event.app, appName) ||
    !targets.includes(event.target) ||
    !matches(event.sha, gitSha) ||
    !matches(event.recipeDigest, recipeSha) ||
    !matches(event.observedHeadSha, gitSha)
  ) {
    throw new ShadowInputError(
      `events[${index}] must supply app, target, sha, recipeDigest and observedHeadSha in canonical form`
    );
  }
  return event;
}

export function planDeploymentQueue(input) {
  if (
    !hasFields(input, ['schemaVersion', 'events']) ||
    input.schemaVersion !== 1 ||
    !Array.isArray(input.events)
  ) {
    throw new ShadowInputError('expected schemaVersion 1 and an events array');
  }

  const pending = new Map();
  const seen = new Map();
  const decisions = [];
  for (const [index, value] of input.events.entries()) {
    const event = parseEvent(value, index);
    const { app, target, sha, recipeDigest, observedHeadSha } = event;
    const job = { app, target, sha, recipeDigest };
    const lane = JSON.stringify([app, target]);
    const key = JSON.stringify([app, target, sha, recipeDigest]);
    const previous = pending.get(lane);

    const atHead = sha === observedHeadSha;
    const duplicateOf = seen.get(key);
    const queues = atHead && duplicateOf === undefined;
    if (previous && (queues || previous.job.sha !== observedHeadSha)) {
      decisions[previous.index] = {
        index: previous.index,
        job: previous.job,
        disposition: 'no_work',
        reason: queues ? 'superseded' : 'head_changed',
        displacedBy: index,
      };
      pending.delete(lane);
    }

    if (!atHead) {
      decisions.push({
        index,
        job,
        disposition: 'no_work',
        reason: 'stale_head',
      });
    } else if (duplicateOf !== undefined) {
      decisions.push({
        index,
        job,
        disposition: 'no_work',
        reason: 'duplicate',
        duplicateOf,
      });
    } else {
      const decision = { index, job, disposition: 'pending' };
      decisions.push(decision);
      pending.set(lane, decision);
      seen.set(key, index);
    }
  }

  const pendingJobs = [...pending.values()];
  const queue = targets.flatMap((target) =>
    pendingJobs
      .filter((decision) => decision.job.target === target)
      .map((decision) => decision.index)
  );
  return { schemaVersion: 1, mode: 'shadow', queue, decisions };
}
