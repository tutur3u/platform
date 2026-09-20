const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_CRON_CONFIG_PATH = path.join(
  ROOT_DIR,
  'apps',
  'web',
  'cron.config.json'
);
const WEB_VERCEL_CONFIG_PATH = path.join(
  ROOT_DIR,
  'apps',
  'web',
  'vercel.json'
);

function readJson(filePath, fsImpl = fs) {
  return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
}

function normalizeCronConfig(rawConfig) {
  const jobs = Array.isArray(rawConfig?.jobs) ? rawConfig.jobs : [];
  const seenIds = new Set();
  const seenPaths = new Set();

  return {
    jobs: jobs.map((job, index) => {
      if (!job || typeof job !== 'object' || Array.isArray(job)) {
        throw new Error(`Invalid cron job at index ${index}.`);
      }

      const normalized = {
        description: String(job.description ?? '').trim(),
        enabled: job.enabled !== false,
        vercel: job.vercel !== false,
        id: String(job.id ?? '').trim(),
        path: String(job.path ?? '').trim(),
        schedule: String(job.schedule ?? '').trim(),
      };

      if (!normalized.id) {
        throw new Error(`Cron job at index ${index} is missing id.`);
      }

      if (seenIds.has(normalized.id)) {
        throw new Error(`Duplicate cron job id: ${normalized.id}`);
      }
      seenIds.add(normalized.id);

      if (!normalized.path.startsWith('/api/cron/')) {
        throw new Error(
          `Cron job ${normalized.id} path must start with /api/cron/.`
        );
      }

      if (seenPaths.has(normalized.path)) {
        throw new Error(`Duplicate cron job path: ${normalized.path}`);
      }
      seenPaths.add(normalized.path);

      if (!normalized.schedule) {
        throw new Error(`Cron job ${normalized.id} is missing schedule.`);
      }

      return normalized;
    }),
  };
}

function readCronConfig({
  configPath = WEB_CRON_CONFIG_PATH,
  fsImpl = fs,
} = {}) {
  return normalizeCronConfig(readJson(configPath, fsImpl));
}

function getVercelCronsFromConfig(config) {
  return config.jobs
    .filter((job) => job.enabled && job.vercel !== false)
    .map((job) => ({
      path: job.path,
      schedule: job.schedule,
    }));
}

function getSyncedVercelConfig({
  cronConfigPath = WEB_CRON_CONFIG_PATH,
  fsImpl = fs,
  vercelConfigPath = WEB_VERCEL_CONFIG_PATH,
} = {}) {
  const cronConfig = readCronConfig({ configPath: cronConfigPath, fsImpl });
  const vercelConfig = readJson(vercelConfigPath, fsImpl);

  return {
    ...vercelConfig,
    crons: getVercelCronsFromConfig(cronConfig),
  };
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function getCronSyncDiff({
  cronConfigPath = WEB_CRON_CONFIG_PATH,
  fsImpl = fs,
  vercelConfigPath = WEB_VERCEL_CONFIG_PATH,
} = {}) {
  const current = readJson(vercelConfigPath, fsImpl);
  const expected = getSyncedVercelConfig({
    cronConfigPath,
    fsImpl,
    vercelConfigPath,
  });

  return formatJson(current) === formatJson(expected)
    ? null
    : { current, expected };
}

function syncWebCrons({
  check = false,
  cronConfigPath = WEB_CRON_CONFIG_PATH,
  fsImpl = fs,
  vercelConfigPath = WEB_VERCEL_CONFIG_PATH,
} = {}) {
  const diff = getCronSyncDiff({
    cronConfigPath,
    fsImpl,
    vercelConfigPath,
  });

  if (!diff) {
    return { changed: false };
  }

  if (check) {
    return { changed: true, diff };
  }

  fsImpl.writeFileSync(vercelConfigPath, formatJson(diff.expected));
  return { changed: true, diff };
}

module.exports = {
  ROOT_DIR,
  WEB_CRON_CONFIG_PATH,
  WEB_VERCEL_CONFIG_PATH,
  formatJson,
  getCronSyncDiff,
  getSyncedVercelConfig,
  getVercelCronsFromConfig,
  normalizeCronConfig,
  readCronConfig,
  syncWebCrons,
};
