import { publicInputsDigest } from './wave1-native-artifact.mjs';

export const FIXTURE_PUBLIC_INPUTS_SHA256 =
  'ab2513d58f0caab4d67fdc7ede1cca0bbf7032a3a630c3766fa1a6526a89f832';
export const MAIL_PRODUCTION_HOST = 'nzamlzqfdwaaxdefwraj.supabase.co';

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
  const digest = publicInputsDigest(env);
  if (digest === FIXTURE_PUBLIC_INPUTS_SHA256) {
    throw new Error('Fixture publicInputsSha256 is refused');
  }
  return digest;
}

export function assertReceiptDigest(receipt, env) {
  const digest = assertReleaseInputs(env);
  if (receipt?.publicInputsSha256 !== digest) {
    throw new Error(
      'publicInputsSha256 does not match the production build inputs'
    );
  }
  return digest;
}
