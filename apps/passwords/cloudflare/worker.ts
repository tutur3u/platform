import handler from '@tanstack/react-start/server-entry';
import { workerBuildInfo } from '@tuturuuu/utils/worker-build-info';
import { createPasswordsRuntime } from '../src/service/adapter.server';
import type { PasswordsEnvironment } from '../src/service/environment';
import { withRequestContext } from '../src/service/request-context.server';
import { passwordsRequest } from './passwords-request';

export type { PasswordsEnvironment };

export function passwordsWorkerRequest(
  request: Request,
  env: PasswordsEnvironment
) {
  return passwordsRequest(request, env, {
    buildInfo: (input) => workerBuildInfo(input, 'passwords'),
    createRuntime: createPasswordsRuntime,
    renderPage: async (input) => handler.fetch(input),
    withContext: withRequestContext,
  });
}

export default { fetch: passwordsWorkerRequest };
