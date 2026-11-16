export function deploymentProfile(
  value = 'staging',
  commit = process.env.PLATFORM_BUILD_COMMIT_HASH ??
    process.env.PLAYGROUND_SOURCE_SHA
) {
  if (!['staging', 'production'].includes(value))
    throw new Error('Unknown playground native profile');
  if (!/^[a-f0-9]{40}$/.test(commit ?? ''))
    throw new Error('Missing 40-hex build commit');
  return {
    name:
      value === 'production'
        ? 'tuturuuu-playground'
        : 'tuturuuu-playground-vite-staging',
    vars: { PLATFORM_BUILD_COMMIT_HASH: commit },
  };
}
