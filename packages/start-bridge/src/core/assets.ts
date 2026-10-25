/**
 * A portable static-assets binding. The Workers `Fetcher` (`env.ASSETS`)
 * takes the Workers `Request`, which the web `Request` in app code does not
 * satisfy, and returns the Workers `Response`. Apps type their binding as
 * `AssetsBinding` (structurally satisfied by the real `Fetcher`) and call
 * `fetchAsset`, which passes a URL and a plain init and rebuilds a streaming
 * web `Response` from the reply, so no runtime type crosses the boundary.
 */
export interface AssetsRequestInit {
  method: string;
  headers: Record<string, string>;
}

export interface AssetsHeaders {
  forEach(callback: (value: string, key: string) => void): void;
}

export interface AssetsBodyReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(reason?: unknown): Promise<void>;
}

export interface AssetsResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: AssetsHeaders;
  readonly body: { getReader(): AssetsBodyReader } | null;
}

export interface AssetsBinding {
  fetch(input: string, init: AssetsRequestInit): Promise<AssetsResponse>;
}

const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/** Serves `request` from the assets binding as a web `Response`. */
export async function fetchAsset(
  binding: AssetsBinding,
  request: Request
): Promise<Response> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const asset = await binding.fetch(request.url, {
    method: request.method,
    headers,
  });
  const responseHeaders = new Headers();
  asset.headers.forEach((value, key) => {
    responseHeaders.append(key, value);
  });
  const reader = asset.body?.getReader();
  if (reader && NULL_BODY_STATUSES.has(asset.status)) {
    await reader.cancel();
  }
  const body =
    reader && !NULL_BODY_STATUSES.has(asset.status)
      ? new ReadableStream<Uint8Array>({
          async pull(controller) {
            const { done, value } = await reader.read();
            if (done) controller.close();
            else if (value) controller.enqueue(value);
          },
          cancel: (reason) => reader.cancel(reason),
        })
      : null;
  return new Response(body, {
    status: asset.status,
    statusText: asset.statusText,
    headers: responseHeaders,
  });
}
