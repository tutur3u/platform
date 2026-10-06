/* biome-ignore-all lint/suspicious/noUndeclaredEnvVars: protected CI-only signing inputs */
export const BUNDLE_URL =
  'https://infrastructure.tuturuuu.com/api/v1/desktop-deployment/bundle';
export const AUDIENCE = 'tuturuuu-desktop-deployment';
const fail = () => {
  throw new Error('Desktop vault admission failed');
};
export function mask(value, write = (line) => process.stdout.write(line)) {
  write(
    `::add-mask::${value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}\n`
  );
}
export function assertVaultRunner(env) {
  if (
    env.DESKTOP_SIGNING_SOURCE !== 'vault' ||
    env.GITHUB_ACTIONS !== 'true' ||
    env.GITHUB_REPOSITORY !== 'tutur3u/platform' ||
    env.GITHUB_REF !== 'refs/heads/production' ||
    env.GITHUB_WORKFLOW_REF !==
      'tutur3u/platform/.github/workflows/desktop-beta.yaml@refs/heads/production' ||
    !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME) ||
    !/^[1-9]\d*$/u.test(env.GITHUB_RUN_ID ?? '') ||
    !/^[1-9]\d*$/u.test(env.GITHUB_RUN_ATTEMPT ?? '') ||
    !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA ?? '') ||
    !{ windows: 'Windows', macos: 'macOS' }[env.DESKTOP_PLATFORM] ||
    { windows: 'Windows', macos: 'macOS' }[env.DESKTOP_PLATFORM] !==
      env.RUNNER_OS ||
    !env.RUNNER_TEMP ||
    !/^ttr_desktop_ci_[A-Za-z0-9_-]{43}$/u.test(
      env.DESKTOP_VAULT_CI_TOKEN ?? ''
    )
  )
    fail();
  let url;
  try {
    url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  } catch {
    fail();
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname.endsWith('.actions.githubusercontent.com') ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  )
    fail();
  url.searchParams.set('audience', AUDIENCE);
  return url;
}
export async function boundedJson(response, limit) {
  if (!response.ok || !response.body) fail();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        value.fill(0);
        await reader.cancel();
        fail();
      }
      chunks.push(Buffer.from(value));
      value.fill(0);
    }
    const bytes = Buffer.concat(chunks);
    try {
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      );
    } finally {
      bytes.fill(0);
    }
  } catch {
    fail();
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    reader.releaseLock();
  }
}
export async function fetchSigningBundle(
  env,
  { request = fetch, hide = mask } = {}
) {
  try {
    const url = assertVaultRunner(env);
    hide(env.DESKTOP_VAULT_CI_TOKEN);
    hide(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN);
    const oidc = await boundedJson(
      await request(url, {
        headers: {
          Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      }),
      32768
    );
    if (
      typeof oidc.value !== 'string' ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(oidc.value) ||
      oidc.value.length > 16384
    )
      fail();
    hide(oidc.value);
    return await boundedJson(
      await request(BUNDLE_URL, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${env.DESKTOP_VAULT_CI_TOKEN}`,
          'X-GitHub-OIDC-Token': oidc.value,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ platform: env.DESKTOP_PLATFORM }),
      }),
      6291456
    );
  } catch {
    fail();
  }
}
