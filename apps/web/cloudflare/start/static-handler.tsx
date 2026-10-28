import { getSsrStatus } from '@tanstack/react-router/ssr/server';
import { createStartHandler, StartServer } from '@tanstack/react-start/server';
import { renderToStaticMarkup } from 'react-dom/server';

// This candidate serves static legal documents. No client router or hydration
// payload is needed; keep the response compatible with its script-free CSP.
export const staticStartHandler = createStartHandler({
  handler: ({ router, responseHeaders }) => {
    try {
      return new Response(
        '<!DOCTYPE html>' +
          renderToStaticMarkup(<StartServer router={router} />),
        { status: getSsrStatus(router), headers: responseHeaders }
      );
    } finally {
      router.serverSsr?.cleanup();
    }
  },
});
