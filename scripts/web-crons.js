const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_CRON_CONFIG_PATH = path.join(
  ROOT_DIR,
  'apps',
  'web',
  'cron.config.json'
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

module.exports = {
  ROOT_DIR,
  WEB_CRON_CONFIG_PATH,
  normalizeCronConfig,
  readCronConfig,
};
