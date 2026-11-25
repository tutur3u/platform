// vinext Worker entry. The fetch install module is imported first so it
// evaluates before vinext captures the network fetch.
import './install-workers-fetch';
import handler from 'vinext/server/fetch-handler';
import { withBuildStamp } from './build-stamp';

// Replaced at build time by the build-stamp plugin (vite.vinext.config.ts).
declare const __TUTURUUU_BUILD_COMMIT__: string | undefined;

export * from 'vinext/server/fetch-handler';
export default withBuildStamp(
  handler,
  typeof __TUTURUUU_BUILD_COMMIT__ === 'string'
    ? __TUTURUUU_BUILD_COMMIT__
    : undefined
);
