import { generateKeyPairSync, sign } from 'node:crypto';

// Disposable Cloudflare Access team keys for workerd acceptance only. The
// emitted Worker fetches this JWKS through the test's outbound fixture.
export function accessFixture() {
  const teamDomain = 'web-fixture.cloudflareaccess.com';
  const audience = 'web-fixture-aud';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const otherKey = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  }).privateKey;
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    certsUrl: `https://${teamDomain}/cdn-cgi/access/certs`,
    jwks: {
      keys: [
        {
          ...publicKey.export({ format: 'jwk' }),
          kid: 'web',
          alg: 'RS256',
          use: 'sig',
        },
      ],
    },
    otherKey,
    bindings: { CF_ACCESS_TEAM_DOMAIN: teamDomain, CF_ACCESS_AUD: audience },
    token({ key = privateKey, aud = audience, exp = 600 } = {}) {
      const now = Math.floor(Date.now() / 1000);
      const body = `${encode({ alg: 'RS256', kid: 'web', typ: 'JWT' })}.${encode(
        {
          iss: `https://${teamDomain}`,
          aud: [aud],
          iat: now - 5,
          exp: now + exp,
          email: 'web-fixture@tuturuuu.invalid',
        }
      )}`;
      return `${body}.${sign('sha256', Buffer.from(body), key).toString('base64url')}`;
    },
  };
}
