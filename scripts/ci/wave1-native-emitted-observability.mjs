import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { profiles } from './wave1-native-profile.mjs';

/** Build Output declares camelCase; script-settings reads back snake_case. */
function fromBuildOutput(observability) {
  if (observability == null) return null;
  return {
    enabled: observability.enabled,
    head_sampling_rate: observability.headSamplingRate,
  };
}

async function readEmittedWorkerConfig({ app, appRoot, environment, sha }) {
  // Same artifact selection as uploadArtifact: the sealed receipt picks the emitter.
  if (
    app === 'calendar' &&
    existsSync(resolve(appRoot, 'calendar-artifact.json'))
  ) {
    const { calendarWorkerConfig } = await import('./calendar-cf-output.mjs');
    return calendarWorkerConfig(appRoot, sha);
  }
  if (existsSync(resolve(appRoot, 'wave1-artifact.json'))) {
    const { wave1WorkerConfig } = await import('./wave1-cf-output.mjs');
    return wave1WorkerConfig(appRoot, app, environment, sha);
  }
  assert.fail(
    'Wave-1 publication requires a sealed calendar-artifact.json or wave1-artifact.json'
  );
}

export class ObservabilityConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ObservabilityConfigError';
  }
}

/**
 * The script-settings expectation for a publication, taken from the Build
 * Output the emitter writes for this artifact. Returns null when the emitted
 * output declares no observability: that deploy does not manage the settings,
 * so there is nothing to check. A value declared in the app profile that the
 * emitter drops or alters is a build-config mismatch and fails before deploy.
 */
export async function settingsExpectation({
  app,
  appRoot,
  environment,
  sha,
  worker,
  readWorkerConfig = readEmittedWorkerConfig,
}) {
  const emitted = fromBuildOutput(
    (await readWorkerConfig({ app, appRoot, environment, sha }))?.observability
  );
  const declared = profiles.apps[app]?.observability;
  if (
    declared &&
    (emitted?.enabled !== declared.enabled ||
      emitted?.head_sampling_rate !== declared.head_sampling_rate)
  )
    throw new ObservabilityConfigError(
      `${worker} Build Output observability differs from the app profile ` +
        `(profile enabled=${declared.enabled}, head_sampling_rate=${declared.head_sampling_rate}; ` +
        `emitted ${emitted ? `enabled=${emitted.enabled}, head_sampling_rate=${emitted.head_sampling_rate}` : 'none'}). ` +
        'Nothing was deployed; fix the emitter or the profile.'
    );
  return emitted;
}

export function logSkippedSettingsCheck(worker) {
  console.log(
    `${worker}: emitted Build Output declares no observability; the deploy does not manage script settings, so the settings check is skipped`
  );
}
