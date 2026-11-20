import { resolveClientIp } from '../abuse-protection/client-ip';
import type { AbuseGuardClient } from './client';
import { selectAbuseGuard } from './select';
import { guardSourceBucket } from './source';

type Guard = Pick<AbuseGuardClient, 'hitWindows' | 'withFairness'>;

type PublicAdmission =
  | { kind: 'denied' | 'challenge' }
  | {
      kind: 'admitted';
      admitVerifiedSubject(digest: string): Promise<boolean>;
    };

type SurfacePolicy = {
  /** Server-owned surface name. Never derive this from the request path. */
  surface: string;
  ipLimit: number;
  challengeAfter: number;
  subjectLimit: number;
  windowMs: number;
};

type AdmissionDependencies = {
  guard?: Guard | null;
  trustedIp?: string;
  verifyChallenge?: () => Promise<boolean>;
};

const digestPattern = /^[0-9a-f]{64}$/;

/** Charge an ingress quota before resource lookups, then a verified resource quota. */
export async function admitPublicRequest(
  request: Request,
  policy: Readonly<SurfacePolicy>,
  dependencies: AdmissionDependencies = {}
): Promise<PublicAdmission> {
  const sourceIp = dependencies.trustedIp ?? resolveClientIp(request.headers);
  const source = guardSourceBucket(sourceIp);
  if (source === 'unknown') return { kind: 'denied' };

  const selected =
    dependencies.guard === undefined
      ? selectAbuseGuard('ratelimit')
      : undefined;
  const provider =
    dependencies.guard ??
    (selected?.kind === 'durable-object' ? selected.client : null);
  if (!provider) return { kind: 'denied' };
  const client = provider.withFairness({ source: sourceIp });

  async function spend(partition: string, limit: number) {
    try {
      return await client.hitWindows([
        {
          partition: `${policy.surface}:${partition}`,
          windows: [
            {
              key: 'requests',
              algo: 'sliding',
              limit,
              windowMs: policy.windowMs,
            },
          ],
        },
      ]);
    } catch {
      return null;
    }
  }

  const ingress = await spend(`source:${source}`, policy.ipLimit);
  if (!ingress?.ok) return { kind: 'denied' };
  const used = policy.ipLimit - ingress.remaining;
  if (used > policy.challengeAfter) {
    const verified = await dependencies.verifyChallenge?.().catch(() => false);
    if (!verified) return { kind: 'challenge' };
  }

  return {
    kind: 'admitted',
    async admitVerifiedSubject(digest) {
      if (!digestPattern.test(digest)) return false;
      const result = await spend(`subject:${digest}`, policy.subjectLimit);
      return result?.ok === true;
    },
  };
}
