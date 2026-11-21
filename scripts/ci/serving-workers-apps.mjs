// The Workers that already serve production traffic and are republished from
// their own sealed production-SHA artifacts by serving-workers.mjs.

const nativeRestore = (app, { profile = true, env = {} } = {}) => ({
  script: `scripts/ci/${app}-native-artifact.py`,
  profile,
  env: (sha) => ({ [`${app.toUpperCase()}_SOURCE_SHA`]: sha, ...env }),
});

export const SERVING_WORKERS = {
  roadmap: {
    worker: 'tuturuuu-roadmap',
    artifact: (sha) => `roadmap-worker-${sha}`,
    archive: 'roadmap-worker.tar.gz',
    restore: 'roadmap',
    origins: ['https://tuturuuu.com/roadmap'],
    probes: ['', '/vi', '/workshops/edufest-2026'],
  },
  learn: {
    worker: 'tuturuuu-learn',
    artifact: (sha) => `learn-cutover-production-${sha}`,
    archive: 'learn-production-artifact.tar.gz',
    restore: nativeRestore('learn', {
      env: { CUTOVER_ARTIFACT_PROFILE: 'production' },
    }),
    origins: ['https://learn.tuturuuu.com', 'https://tuturuuu.com/learn'],
    probes: ['', '/login'],
  },
  teach: {
    worker: 'tuturuuu-teach',
    artifact: (sha) => `teach-cutover-production-${sha}`,
    archive: 'teach-production-artifact.tar.gz',
    restore: nativeRestore('teach', {
      env: { CUTOVER_ARTIFACT_PROFILE: 'production' },
    }),
    origins: ['https://teach.tuturuuu.com', 'https://tuturuuu.com/teach'],
    probes: ['', '/login'],
  },
  nova: {
    worker: 'tuturuuu-nova',
    artifact: (sha) => `nova-cutover-production-${sha}`,
    archive: 'nova-production-artifact.tar.gz',
    restore: nativeRestore('nova', {
      env: { VITE_NOVA_NATIVE_PROFILE: 'production' },
    }),
    origins: ['https://tuturuuu.com/nova'],
    probes: ['', '/login'],
  },
  tools: {
    worker: 'tuturuuu-tools',
    artifact: (sha) => `tools-cutover-${sha}`,
    archive: 'tools-cutover.tar.gz',
    restore: nativeRestore('tools', {
      profile: false,
      env: { VITE_TOOLS_NATIVE_PROFILE: 'production' },
    }),
    origins: ['https://tools.tuturuuu.com', 'https://tuturuuu.com/tools'],
    probes: [''],
  },
  lms: {
    worker: 'tuturuuu-lms',
    artifact: (sha) => `lms-worker-${sha}`,
    archive: 'lms-native-artifact.tar.gz',
    restore: nativeRestore('lms', { profile: false }),
    origins: ['https://tuturuuu.com/lms'],
    probes: ['', '/login'],
  },
};

export function appConfig(app) {
  if (!Object.hasOwn(SERVING_WORKERS, app))
    throw new Error(`Not a serving worker: ${app}`);
  return SERVING_WORKERS[app];
}
