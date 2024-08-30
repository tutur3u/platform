'use client';

import Error from 'next/error';

export default function GlobalError() {
  return (
    <html>
      <body>
        {/* This is the default Next.js error component, but it doesn't allow omitting the statusCode property yet. */}
        <Error statusCode={undefined as any} />
      </body>
    </html>
  );
}
