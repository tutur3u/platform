import { publicInputsDigest } from './wave1-native-artifact.mjs';

export const FIXTURE_PUBLIC_INPUTS_SHA256 =
  'ab2513d58f0caab4d67fdc7ede1cca0bbf7032a3a630c3766fa1a6526a89f832';
export const MAIL_PRODUCTION_HOST = 'nzamlzqfdwaaxdefwraj.supabase.co';
export const FINANCE_PRODUCTION_HOST = 'nzamlzqfdwaaxdefwraj.supabase.co';
export const DRIVE_PRODUCTION_HOST = 'nzamlzqfdwaaxdefwraj.supabase.co';

export function assertReleaseInputs(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  if (!url || !key) throw new Error('Production public inputs are required');
  if (url.includes('.invalid') || key.endsWith('_ci_placeholder')) {
    throw new Error('Fixture production public inputs are refused');
  }
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    host = '';
  }
  if (env.APP === 'mail' && host !== MAIL_PRODUCTION_HOST) {
    throw new Error('Mail production URL host is not the admitted host');
  }
  if (env.APP === 'finance' && host !== FINANCE_PRODUCTION_HOST) {
    throw new Error('Finance production URL host is not the admitted host');
  }
  if (env.APP === 'drive' && host !== DRIVE_PRODUCTION_HOST) {
    throw new Error('Drive production URL host is not the admitted host');
  }
  const digest = publicInputsDigest(env);
  if (digest === FIXTURE_PUBLIC_INPUTS_SHA256) {
    throw new Error('Fixture publicInputsSha256 is refused');
  }
  return digest;
}

/** The release-candidate ref of one main commit; its name binds the SHA. */
export function releaseCandidateRef(sha) {
  return `refs/heads/release-candidate/${sha}`;
}

export function assertMainReleaseAdmission(env) {
  if (env.RELEASE_ARTIFACT !== 'true') return null;
  if (
    env.GITHUB_REF !== 'refs/heads/main' &&
    !(
      /^[0-9a-f]{40}$/.test(env.GITHUB_SHA || '') &&
      env.GITHUB_REF === releaseCandidateRef(env.GITHUB_SHA)
    )
  ) {
    throw new Error(
      'release-artifact runs only on refs/heads/main or the release-candidate ref of its own commit'
    );
  }
  const sourceSha = env.GITHUB_SHA || '';
  const requestedSha = env.REQUESTED_SHA || '';
  if (!/^[0-9a-f]{40}$/.test(sourceSha) || sourceSha !== requestedSha) {
    throw new Error(
      'release-artifact source SHA does not match this main commit'
    );
  }
  const inputEnvironment = `wave1-${env.APP}-production`;
  if (env.INPUT_ENVIRONMENT !== inputEnvironment) {
    throw new Error(
      'release-artifact input environment is not the production public environment'
    );
  }
  return { sourceSha, inputEnvironment };
}

/**
 * A release-candidate ref is admitted only while its commit is on main:
 * GitHub's compare of the commit against main must report main ahead of it
 * or identical. Main itself needs no lookup.
 */
export async function assertReleaseCandidateOnMain(env, fetcher = fetch) {
  const admission = assertMainReleaseAdmission(env);
  if (!admission || env.GITHUB_REF === 'refs/heads/main') return admission;
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY || '') || !env.GH_TOKEN)
    throw new Error('release-candidate ancestry check is not configured');
  const response = await fetcher(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/compare/${admission.sourceSha}...main`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GH_TOKEN}`,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!response.ok)
    throw new Error(
      `release-candidate ancestry check failed (${response.status})`
    );
  const { status, merge_base_commit: base } = await response.json();
  if (
    !['ahead', 'identical'].includes(status) ||
    base?.sha !== admission.sourceSha
  )
    throw new Error('release-candidate commit is not on main');
  return admission;
}

export function stampReleaseSeal(receipt, env) {
  const admission = assertMainReleaseAdmission(env);
  const digest = assertReleaseInputs(env);
  if (receipt?.sha !== admission.sourceSha) {
    throw new Error('release seal source SHA does not match the receipt');
  }
  if (receipt?.publicInputsSha256 !== digest) {
    throw new Error(
      'publicInputsSha256 does not match the production build inputs'
    );
  }
  return {
    ...receipt,
    sourceSha: admission.sourceSha,
    inputEnvironment: admission.inputEnvironment,
  };
}

export function assertReceiptDigest(receipt, env) {
  const sealed = stampReleaseSeal(receipt, env);
  if (
    receipt?.sourceSha !== sealed.sourceSha ||
    receipt?.inputEnvironment !== sealed.inputEnvironment
  ) {
    throw new Error(
      'release seal does not record the source SHA and input environment'
    );
  }
  return sealed.publicInputsSha256;
}

export function assertRestoredReleaseSeal(receipt, env) {
  const admission = assertMainReleaseAdmission(env);
  if (
    receipt?.sha !== admission.sourceSha ||
    receipt?.sourceSha !== admission.sourceSha
  ) {
    throw new Error('release seal source SHA does not match the receipt');
  }
  if (receipt?.inputEnvironment !== admission.inputEnvironment) {
    throw new Error(
      'release seal input environment does not match the production public environment'
    );
  }
  if (receipt?.publicInputsSha256 === FIXTURE_PUBLIC_INPUTS_SHA256) {
    throw new Error('Fixture publicInputsSha256 is refused');
  }
  if (!/^[a-f0-9]{64}$/.test(receipt?.publicInputsSha256 || '')) {
    throw new Error('release seal public input digest is missing');
  }
  return receipt.publicInputsSha256;
}
