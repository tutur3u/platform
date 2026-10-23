const COPY = {
  'not-found': {
    title: 'Link Not Found',
    description:
      "The shortened link you're looking for doesn't exist or has been removed.",
  },
  invalid: {
    title: 'Invalid URL',
    description: "The shortened link you're looking for is invalid.",
  },
} as const;

/** The legacy not-found and invalid-destination pages. */
export function LinkStatusPage({ kind }: { kind: keyof typeof COPY }) {
  const copy = COPY[kind];
  return (
    <div className="min-h-screen bg-linear-to-br from-dynamic-red/5 to-dynamic-red/10 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md">
        <div className="text-center">
          <h1 className="mb-4 font-bold text-2xl text-dynamic-red">
            {copy.title}
          </h1>
          <p className="mb-6 text-dynamic-red/80">{copy.description}</p>
          <a
            href="/"
            className="inline-block rounded-md bg-dynamic-red px-4 py-2 text-white transition-colors hover:bg-dynamic-red/80 focus:outline-none focus:ring-2 focus:ring-dynamic-red focus:ring-offset-2"
          >
            Go to Homepage
          </a>
        </div>
      </div>
    </div>
  );
}
