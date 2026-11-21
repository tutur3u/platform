const contentTypeMap: Record<string, string> = {
  '.js': 'application/javascript; charset=UTF-8',
  '.map': 'application/json; charset=UTF-8',
};

/** The response for one service-worker output file, or 404 when absent. */
export function offlineWorkerResponse(
  contents: string | undefined,
  extension: string
) {
  if (contents === undefined) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(contents, {
    headers: {
      'Content-Type': contentTypeMap[extension] ?? 'text/plain; charset=UTF-8',
      'Service-Worker-Allowed': '/',
    },
  });
}
