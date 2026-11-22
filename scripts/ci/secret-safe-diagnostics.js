// Errors from subprocesses and providers can contain credentials in their
// message, arguments, or output. Map error metadata to fixed diagnostic text.
function safeFailureSuffix(error) {
  const { code, httpStatus, status = error?.exitCode } = error ?? {};
  switch (httpStatus) {
    case 401:
      return ' (HTTP 401)';
    case 403:
      return ' (HTTP 403)';
    case 429:
      return ' (HTTP 429)';
    default:
      if (
        Number.isInteger(httpStatus) &&
        httpStatus >= 400 &&
        httpStatus <= 499
      )
        return ' (HTTP 4xx)';
      if (
        Number.isInteger(httpStatus) &&
        httpStatus >= 500 &&
        httpStatus <= 599
      )
        return ' (HTTP 5xx)';
  }
  if (Number.isInteger(status) && status > 0 && status <= 255)
    return ' (nonzero exit)';
  switch (code) {
    case 'EACCES':
      return ' (EACCES)';
    case 'EEXIST':
      return ' (EEXIST)';
    case 'ENOENT':
      return ' (ENOENT)';
    case 'ETIMEDOUT':
      return ' (ETIMEDOUT)';
    default:
      return '';
  }
}

const toolingMessages = Object.freeze({
  'docker-action': 'Expected a Docker command of up or down.',
  'docker-env-file': 'Expected an env file path after --env-file.',
  'docker-profile': 'Expected a profile name after --profile.',
  'docker-project': 'Expected a project name after -p or --project-name.',
  'docker-mode': 'Expected --mode to be either "dev" or "prod".',
  'docker-memory': 'Expected a memory value after --build-memory.',
  'docker-cpus': 'Expected a CPU value after --build-cpus.',
  'docker-parallelism':
    'Expected an integer value after --build-max-parallelism.',
  'docker-builder': 'Expected a builder name after --build-builder-name.',
  'docker-strategy':
    'Expected --strategy to be either "in-place" or "blue-green".',
  'deployment-active':
    'Active blue/green deployment build detected. Re-run with --cancel-active-build or DOCKER_WEB_CANCEL_ACTIVE_BUILD=1 to cancel it before starting a fresh deployment.',
  'log-drain-startup':
    'Log-drain Postgres failed to start before promotion. Inspect the log-drain-postgres service locally before retrying.',
  'e2e-frontend':
    'Unsupported Docker web E2E frontend. Expected next, tanstack, or compare.',
  'e2e-compare':
    'Docker E2E compare failed. Inspect the configured compare report for the failing frontend.',
  'e2e-cleanup': 'Web E2E Docker cleanup failed.',
});

class ToolingDiagnosticError extends Error {
  constructor(diagnostic, message, options) {
    super(message ?? toolingMessages[diagnostic], options);
    this.diagnostic = diagnostic;
  }
}

function safeToolingFailure(error, operation) {
  if (error instanceof ToolingDiagnosticError) {
    const entry = Object.entries(toolingMessages).find(
      ([diagnostic]) => diagnostic === error.diagnostic
    );
    if (entry) return entry[1];
  }
  return `${operation} failed${safeFailureSuffix(error)}.`;
}

module.exports = {
  safeFailureSuffix,
  safeToolingFailure,
  ToolingDiagnosticError,
};
