import Link from 'next/link';
import { TuturuuuClient } from 'tuturuuu';
import { ValidationError } from 'tuturuuu/errors';
import { StorageClient } from 'tuturuuu/storage';
import {
  type DownloadOptions,
  imageTransformOptionsSchema,
  type ShareOptions,
} from 'tuturuuu/types';

const shareOptions: ShareOptions = {
  expiresIn: 3600,
  transform: {
    width: 320,
    height: 180,
    resize: 'cover',
  },
};

const downloadOptions: DownloadOptions = {
  transform: {
    width: 640,
    height: 360,
  },
};

const parsedTransform = imageTransformOptionsSchema.parse({
  width: 200,
  height: 200,
  resize: 'contain',
});

const client = new TuturuuuClient({
  apiKey: 'ttr_smoke_test_key',
  baseUrl: 'https://example.com/api/v1',
  fetch: globalThis.fetch,
});

const smokeSummary = {
  storageClient: client.storage instanceof StorageClient,
  validationErrorName: new ValidationError('smoke test').name,
  shareTransformWidth: shareOptions.transform?.width,
  downloadTransformHeight: downloadOptions.transform?.height,
  parsedResize: parsedTransform.resize,
};

export default function SDKSmokePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <div className="space-y-3">
        <Link className="text-dynamic-blue underline" href="/">
          Back to demos
        </Link>
        <div>
          <h1 className="font-bold text-3xl text-dynamic-foreground">
            Tuturuuu SDK Smoke Test
          </h1>
          <p className="text-dynamic-muted-foreground">
            This page exists to ensure Next.js and Turbopack can compile the
            published SDK entrypoints from an external app.
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-dynamic-border bg-dynamic-background p-6">
        <h2 className="mb-3 font-semibold text-dynamic-foreground text-xl">
          Import Results
        </h2>
        <pre className="overflow-x-auto rounded-xl bg-dynamic-muted p-4 text-dynamic-foreground text-sm">
          {JSON.stringify(smokeSummary, null, 2)}
        </pre>
      </section>
    </main>
  );
}
