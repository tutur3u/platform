import { runtimeAppBase } from '@tuturuuu/start-bridge/app-url';
import {
  type BridgeDispatch,
  defaultProxyMatches,
  dispatchThroughProxy,
  type NextProxy,
} from '@tuturuuu/start-bridge/proxy-bridge';
import {
  bridgeRequest,
  maybeBridgeRequest,
} from '@tuturuuu/start-bridge/request-context';
import { resolveTuturuuuWebAppUrl } from '@tuturuuu/utils/next-config';
import {
  type CalendarRequestContext,
  withCalendarRequest,
} from './request-context';
import { requestInit } from './request-init';

export const proxyMatches = defaultProxyMatches;

export function dispatchThroughCalendarProxy({
  request,
  proxy,
  dispatch,
  waitUntil,
  cloudflare,
  telemetry,
}: {
  request: Request;
  proxy: NextProxy;
  dispatch: BridgeDispatch;
  waitUntil: (work: Promise<unknown>) => void;
  cloudflare?: CalendarRequestContext['cloudflare'];
  telemetry?: CalendarRequestContext['telemetry'];
}) {
  const enter = <T>(forwarded: Request, run: () => T) => {
    const context = bridgeRequest();
    return withCalendarRequest(
      {
        request: forwarded,
        responseHeaders: context.responseHeaders,
        waitUntil,
        cloudflare,
        telemetry,
        appBase: context.appBase,
        nonce: context.nonce,
      },
      run
    );
  };
  return dispatchThroughProxy({
    request,
    nonce: maybeBridgeRequest()?.nonce,
    waitUntil,
    cloudflare,
    matches: proxyMatches,
    basePath: runtimeAppBase(),
    requestInit,
    rewriteOrigins: [resolveTuturuuuWebAppUrl()],
    proxy: (forwarded) => enter(forwarded, () => proxy(forwarded)),
    dispatch: (forwarded) => enter(forwarded, () => dispatch(forwarded)),
  });
}
