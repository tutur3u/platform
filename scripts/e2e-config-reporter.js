// Public Playwright Reporter API: JSON reporter omits dependency relationships.
const GRAPH_PREFIX = 'E2E_CONFIG_GRAPH:';
class E2EConfigReporter {
  onBegin(config) {
    process.stdout.write(
      `${GRAPH_PREFIX}${JSON.stringify({
        globalTimeout: config.globalTimeout,
        maxFailures: config.maxFailures,
        projects: config.projects.map((project) => ({
          name: project.name,
          dependencies: project.dependencies.map((dependency) => dependency),
          teardown: project.teardown ?? null,
          repeatEach: project.repeatEach,
        })),
      })}\n`
    );
  }
}
module.exports = E2EConfigReporter;
module.exports.GRAPH_PREFIX = GRAPH_PREFIX;
