import { verifyTurnstileToken } from '@tuturuuu/cloudflare/turnstile/server';
import { selectAbuseGuard } from '@tuturuuu/utils/abuse-guard/select';
import {
  createPlayIntegrityVerifier,
  type NativeIntegrityMode,
  NativeIntegrityService,
} from '@tuturuuu/internal-api/native-integrity';
import { configuredAppleVerifiers } from './apple-verifiers';
import {
  nativeIntegrityActorEligibility,
  nativeIntegrityTurnstileEnabled,
} from './fallback-policy';
import { googleIntegrityAccessToken } from './google-access-token';
import { budgetedNativeIntegrityFetch } from './provider-budget';
import { createNativeIntegrityGuardStore } from './guard-store';
import {
  configureWebIdentityAbuseGuard,
  isAbuseGuardWorkerService,
} from '../web-identity-abuse-guard';
import {
  configuredNativeIntegrityRedis,
  createNativeIntegrityStore,
} from './store';

export function nativeIntegrityMode(): NativeIntegrityMode {
  const mode = process.env.NATIVE_INTEGRITY_MODE;
  return mode === 'monitor' || mode === 'enforce' ? mode : 'off';
}
export function nativeIntegrityWebOrigin() {
  const origin =
    process.env.NATIVE_INTEGRITY_WEB_ORIGIN ?? 'https://tuturuuu.com';
  const parsed = new URL(origin);
  if (
    parsed.origin !== origin ||
    (parsed.protocol !== 'https:' &&
      !(
        parsed.hostname === 'localhost' && process.env.NODE_ENV !== 'production'
      ))
  )
    throw new Error('Native integrity Web origin unavailable');
  return parsed.origin;
}

export function nativeIntegrityTurnstileParents() {
  const values = [
    nativeIntegrityWebOrigin(),
    ...(process.env.NATIVE_INTEGRITY_TURNSTILE_PARENT_ORIGINS ?? '')
      .split(',')
      .filter(Boolean),
  ];
  if (values.length > 16)
    throw new Error('Native integrity parent origins unavailable');
  return [
    ...new Set(
      values.map((value) => {
        const origin = value.trim();
        const parsed = new URL(origin);
        const local =
          process.env.NODE_ENV !== 'production' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
        if (
          parsed.origin !== origin ||
          (parsed.protocol !== 'https:' &&
            !(local && parsed.protocol === 'http:'))
        )
          throw new Error('Native integrity parent origin unavailable');
        return parsed.origin;
      })
    ),
  ];
}

function nativeIntegrityBackend(actorId: string) {
  const backend = process.env.NATIVE_INTEGRITY_STORE;
  if (backend && backend !== 'redis' && backend !== 'abuse-guard')
    throw new Error('Native integrity store configuration unavailable');
  if (backend === 'abuse-guard' || isAbuseGuardWorkerService()) {
    configureWebIdentityAbuseGuard();
    const selected = selectAbuseGuard('integrity');
    if (selected.kind !== 'durable-object')
      throw new Error('Native integrity guard store unavailable');
    return createNativeIntegrityGuardStore(
      selected.client.withFairness({
        source: 'web-native-integrity',
        principal: actorId,
      })
    );
  }
  const redis = configuredNativeIntegrityRedis();
  return { store: createNativeIntegrityStore(redis), reserve: redis };
}

export function nativeIntegrityRuntime(actorId: string) {
  const mode = nativeIntegrityMode();
  if (mode === 'off') return null;
  if (!actorId || actorId.length > 128)
    throw new Error('Native integrity actor unavailable');
  const backend = nativeIntegrityBackend(actorId);
  const providerFetch = budgetedNativeIntegrityFetch(backend.reserve, actorId);
  const service = new NativeIntegrityService({
    mode,
    store: backend.store,
    allowTurnstile: nativeIntegrityTurnstileEnabled(),
    turnstileActorEligibility: nativeIntegrityActorEligibility,
    verifiers: {
      attest: (input) => configuredAppleVerifiers().attest(input),
      assert: (input) => configuredAppleVerifiers().assert(input),
      play: (input) =>
        createPlayIntegrityVerifier({
          packageName: process.env.NATIVE_INTEGRITY_GOOGLE_PACKAGE_NAME ?? '',
          certificateDigests: (
            process.env.NATIVE_INTEGRITY_GOOGLE_CERTIFICATE_DIGESTS ?? ''
          )
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
          getAccessToken: (signal) =>
            googleIntegrityAccessToken(
              providerFetch,
              Date.now,
              signal,
              actorId
            ),
          fetch: providerFetch,
        })(input),
      turnstile: async ({ token, requestHash }) => {
        await verifyTurnstileToken({ headers: new Headers() }, token, {
          devMode: false,
          includeRemoteIp: false,
          timeoutMs: 5000,
          fetch: providerFetch,
          expectedHostname: new URL(nativeIntegrityWebOrigin()).hostname,
          expectedAction: 'native_integrity',
          expectedCData: requestHash,
        });
      },
    },
    allowDevelopmentApple:
      process.env.NATIVE_INTEGRITY_APPLE_ENVIRONMENT === 'development',
    cloudProjectNumber:
      process.env.NATIVE_INTEGRITY_GOOGLE_CLOUD_PROJECT_NUMBER,
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    turnstileUrl: `${nativeIntegrityWebOrigin()}/native-integrity/turnstile`,
  });
  const assertActor = (claimed: string) => {
    if (claimed !== actorId) throw new Error('Native integrity actor mismatch');
  };
  return {
    issue(input: Parameters<NativeIntegrityService['issue']>[0]) {
      assertActor(input.actorId);
      return service.issue(input);
    },
    enroll(input: Parameters<NativeIntegrityService['enroll']>[0]) {
      assertActor(input.actorId);
      return service.enroll(input);
    },
    verify(input: Parameters<NativeIntegrityService['verify']>[0]) {
      assertActor(input.actorId);
      return service.verify(input);
    },
  };
}
