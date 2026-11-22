import { bindings, defineConfig, defineContainer, exports } from 'cf/config';

const staging = process.env.PLAYGROUND_DEPLOY_ENV === 'staging';
const worker = staging
  ? 'tuturuuu-playground-execution-staging'
  : 'tuturuuu-playground-execution';
const image = process.env.PLAYGROUND_IMAGE;
const ingress = process.env.PLAYGROUND_INGRESS_HOST;
const sourceOrigin = process.env.PLAYGROUND_SOURCE_ORIGIN;
if (
  image &&
  !/^registry\.cloudflare\.com\/[a-f0-9]{32}\/tuturuuu-playground@sha256:[a-f0-9]{64}$/u.test(
    image
  )
) {
  throw new Error(
    'PLAYGROUND_IMAGE must identify a pinned Playground registry image'
  );
}
if (
  ingress &&
  !/^playground-execution(?:-staging)?\.tuturuuu\.com$/u.test(ingress)
) {
  throw new Error('Unexpected Playground ingress hostname');
}
if (
  sourceOrigin &&
  (!/^https:\/\//u.test(sourceOrigin) ||
    new URL(sourceOrigin).username ||
    new URL(sourceOrigin).password)
) {
  throw new Error('PLAYGROUND_SOURCE_ORIGIN must be an HTTPS origin');
}
if (
  ingress &&
  (!image || !sourceOrigin || ingress.includes('-staging') !== staging)
) {
  throw new Error(
    'Playground ingress requires its named environment, an image digest and a source origin'
  );
}

const images = image ? { images: { toolchain: { reference: image } } } : {};
// A fresh guest per Run; at most one per admitted slot.
const slot = defineContainer({
  name: `${worker}-slot`,
  schedulingPolicy: 'durable-object',
  instanceType: 'standard-1',
  maxInstances: 20,
  ssh: { enabled: false },
  observability: { enabled: false },
  ...images,
});
// One warm compile-only guest per room with recent checks, on the smallest
// instance. The cap bounds total live check guests and therefore their cost.
const checker = defineContainer({
  name: `${worker}-checker`,
  schedulingPolicy: 'durable-object',
  instanceType: 'basic',
  maxInstances: 50,
  ssh: { enabled: false },
  observability: { enabled: false },
  ...images,
});

export default defineConfig({
  containers: [slot, checker],
  worker: {
    name: worker,
    entrypoint: 'src/worker.ts',
    compatibilityDate: '2026-11-22',
    compatibilityFlags: ['nodejs_compat'],
    workersDev: false,
    previewUrls: false,
    ...(ingress ? { domains: [ingress] } : {}),
    env: {
      PLAYGROUND_COORDINATOR: bindings.durableObject({
        worker,
        exportName: 'PlaygroundCoordinator',
      }),
      PLAYGROUND_SLOT: bindings.durableObject({
        worker,
        exportName: 'PlaygroundSlot',
      }),
      PLAYGROUND_CHECKER: bindings.durableObject({
        worker,
        exportName: 'PlaygroundChecker',
      }),
      PLAYGROUND_INGRESS_SECRET: bindings.secret(),
      PLAYGROUND_OPERATOR_SECRET: bindings.secret(),
      ...(sourceOrigin
        ? { PLAYGROUND_SOURCE_ORIGIN: bindings.text(sourceOrigin) }
        : {}),
      PLAYGROUND_MAX_CONCURRENT: bindings.text(
        process.env.PLAYGROUND_MAX_CONCURRENT ?? '20'
      ),
      PLAYGROUND_MAX_CONCURRENT_PER_USER: bindings.text(
        process.env.PLAYGROUND_MAX_CONCURRENT_PER_USER ?? '1'
      ),
      PLAYGROUND_MAX_RUNS_PER_USER_10_MINUTES: bindings.text(
        process.env.PLAYGROUND_MAX_RUNS_PER_USER_10_MINUTES ?? '30'
      ),
      PLAYGROUND_MAX_STARTS_PER_UTC_DAY: bindings.text(
        process.env.PLAYGROUND_MAX_STARTS_PER_UTC_DAY ?? '5000'
      ),
      PLAYGROUND_MAX_CHECKS_PER_UTC_DAY: bindings.text(
        process.env.PLAYGROUND_MAX_CHECKS_PER_UTC_DAY ?? '20000'
      ),
    },
    exports: {
      PlaygroundCoordinator: exports.durableObject({ storage: 'sqlite' }),
      PlaygroundSlot: exports.durableObject({
        storage: 'sqlite',
        container: slot,
      }),
      PlaygroundChecker: exports.durableObject({
        storage: 'sqlite',
        container: checker,
      }),
    },
  },
});
