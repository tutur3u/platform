import { registerHooks } from 'node:module';

// Worker sources import the Workers runtime base class and a workspace type module
// whose package entry points at build output. Serve both from source so the
// tests exercise the real Durable Objects without a build.
const typesSource = new URL(
  '../../../packages/types/src/primitives/playgrounds.ts',
  import.meta.url
).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') {
      return {
        url: 'data:text/javascript,export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env}}',
        shortCircuit: true,
      };
    }
    if (specifier === '@tuturuuu/types/primitives/playgrounds') {
      return { url: typesSource, shortCircuit: true };
    }
    // Worker sources use bundler-style extensionless relative imports.
    if (specifier.startsWith('./') && !/\.[cm]?[jt]s$/u.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});
