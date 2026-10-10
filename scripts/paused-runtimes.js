const PAUSED_APP_DIRECTORIES = new Set(['backend', 'tanstack-web']);

// Policy tests may inspect the pause; implementation suites stay out of defaults.
function isPausedImplementationTest(file) {
  const normalized = file.replaceAll('\\', '/');
  if (
    /^scripts\/ci\/(?:rust-verification-workflow|e2e-image-bundle[^/]*|e2e-runtime-[^/]*)\.test\.js$/.test(
      normalized
    )
  )
    return true;
  if (normalized.startsWith('scripts/ci/')) return false;
  if (
    normalized.startsWith('scripts/docker-web/') ||
    normalized.startsWith('scripts/watch-blue-green/')
  )
    return true;
  return /(?:^|\/)(?:docker[^/]*|check-docker[^/]*|buildkit[^/]*|check-backend[^/]*|check-tanstack[^/]*|rust-cache[^/]*|tanstack[^/]*|generate-tanstack[^/]*|run-tanstack[^/]*|run-web-e2e-docker[^/]*|watch-blue-green[^/]*|web-crons[^/]*|watch-web-crons[^/]*|benchmark-web-setups[^/]*|cron-runner[^/]*|calendar-cron-target[^/]*|check-cloudflare-workers[^/]*|smoke-cloudflare-workers[^/]*)\.test\.[cm]?js$/.test(
    normalized
  );
}

function main(argv = process.argv.slice(2)) {
  const target = argv[0] ?? 'runtime';
  console.error(
    `${target} is paused and not in use. This command is disabled until an explicit resumption. Use the maintained Next.js apps and local docs CLI. See apps/docs/build/devops/active-runtime.mdx.`
  );
  process.exitCode = 1;
}

module.exports = { PAUSED_APP_DIRECTORIES, isPausedImplementationTest, main };
if (require.main === module) main();
