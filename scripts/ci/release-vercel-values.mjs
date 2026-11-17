// Credential values are refused before queue transport or receipt persistence.
const digestFields = new Set([
  'sourceSha',
  'recipeSha256',
  'configSha256',
  'artifactSha256',
  'evidenceSha256',
  'lifecycleSha256',
  'predecessorSha256',
  'aliasLockKey',
]);
export function tokenShaped(value) {
  if (typeof value !== 'string') return false;
  if (
    /(?:gh[pousr]_|github_pat_|vca_|vcp_|vercel_)[A-Za-z0-9_-]{8,}/u.test(value)
  )
    return true;
  if (/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u.test(value))
    return true;
  // Scan both encoded strings and their components: separators cannot hide runs.
  return (
    /[A-Za-z0-9+/_=-]{32,}/u.test(value) ||
    value
      .split(/[:/\-_.=+@\s]+/u)
      .some((part) => /[A-Za-z0-9]{32,}/u.test(part))
  );
}
const providerPaths = new Set([
  'target.account',
  'target.project',
  'canonicalTarget.account',
  'canonicalTarget.project',
  'projectId',
  'providerOperationId',
  'deploymentId',
  'aliasReadbackId',
  'aliasPreimageId',
  'rollbackDeploymentId',
  'rollback.deploymentId',
  'candidate.id',
  'preimage.id',
  'artifact.id',
  'lifecycle.projectId',
  'lifecycle.candidate.id',
  'lifecycle.preimage.id',
  'evidence.deploymentId',
  'evidence.aliasReadbackId',
  'evidence.aliasPreimageId',
  'evidence.rollbackDeploymentId',
  'evidence.lifecycle.projectId',
  'evidence.lifecycle.candidate.id',
  'evidence.lifecycle.preimage.id',
]);
function declaredId(path, value) {
  const key = path.join('.');
  return (
    (providerPaths.has(key) &&
      /^(?:dpl|prj|team)_[A-Za-z0-9]{3,100}$/u.test(value)) ||
    (['jobId', 'attemptId', 'workerId', 'operationId'].includes(key) &&
      /^(?:[a-z]+-)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(
        value
      ))
  );
}
export function unsafeValues(value, context = 'record') {
  function visit(current, path, seen) {
    const field = path.at(-1);
    if (typeof current === 'string') {
      const digest =
        (path.length === 1 && digestFields.has(field)) ||
        [
          'lifecycle.artifactSha256',
          'evidence.lifecycle.artifactSha256',
        ].includes(path.join('.')) ||
        path.join('.') === 'artifact.sha256' ||
        (context === 'grant' && path.join('.') === 'targetLockId') ||
        (context === 'originalAttempt' && path.join('.') === 'receiptSha256');
      if (digest && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(current))
        return false;
      if (declaredId(path, current)) return false;
      if (
        field === 'executorHost' &&
        /^(?:[a-z0-9][a-z0-9-]*\.)+[a-z]{2,24}$/u.test(current)
      )
        return current.split('.').some(tokenShaped);
      return tokenShaped(current);
    }
    if (!current || typeof current !== 'object') return false;
    if (seen.has(current)) return true;
    seen.add(current);
    const unsafe = Object.entries(current).some(([key, child]) =>
      visit(child, [...path, key], seen)
    );
    seen.delete(current);
    return unsafe;
  }
  return visit(value, [], new Set());
}
